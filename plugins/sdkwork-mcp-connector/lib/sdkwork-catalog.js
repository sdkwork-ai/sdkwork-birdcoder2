/**
 * SDKWork 云端连接器目录。
 *
 * 目录不再是随包发布的 JSON，也不再从公共 CDN registry 拉取：连接器条目属于
 * `sdkwork-mcp` 应用的数据库（`ai_mcp_catalog_entry` / `..._server` /
 * `..._prompt`），由该应用的 App API 暴露，并通过它生成的 App SDK
 * （`@sdkwork/mcp-app-sdk`）读取。本模块只做三件事：
 *
 * 1. 解析当前部署的 SDKWork 环境（网关地址 + 访问令牌）：优先取插件配置，
 *    其次取 `ui-sdkwork-env` 设置段里当前环境的 profile，最后回退到宿主进程
 *    的 SDKWork 环境变量（打包构建与本地开发都不经过设置文档时仍能读取目录）；
 * 2. 通过生成的 SDK 分页读取目录条目（每个条目自带 servers 与 prompts）；
 * 3. 把记录映射成连接器描述符（`connectorDescriptorSchema` 的形状），交给
 *    `catalog.js` 里既有的审计与合并流程，因此目录校验、密钥扫描与本地覆盖
 *    的语义完全不变。
 *
 * 目录是只读数据：这里不发任何写请求，也不保存凭证。
 */
import { createClient } from '@sdkwork/mcp-app-sdk/generated';

/** `ui-sdkwork-env` 设置段的名字：SDKWork 部署环境（网关 + 应用凭据）。 */
export const SDKWORK_ENV_SETTINGS_NAMESPACE = 'ui-sdkwork-env';

/** 支持的部署环境档位，与 `ui-sdkwork-env` 的设置 schema 一致。 */
export const SDKWORK_ENVIRONMENTS = ['development', 'testing', 'production'];

/** 目录分类来自 `ai_mcp_server_category` 的显示名，查询时不额外请求分类表。 */
const CATALOG_PAGE_SIZE = 100;
/** 防御性上限：目录是人工维护的货架，超过这么多页说明服务端分页异常。 */
const MAX_CATALOG_PAGES = 20;

/** 宿主进程环境变量：网关地址（与 `ui-sdkwork-env` 的投影键一致）。 */
const HOST_BASE_URL_KEYS = [
  'SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL',
  'SDKWORK_BIRDCODER_APP_API_BASE_URL',
  'SDKWORK_BIRDCODER_APPLICATION_PUBLIC_HTTP_URL',
];
/** 宿主进程环境变量：静态访问令牌。 */
const HOST_ACCESS_TOKEN_KEYS = ['SDKWORK_ACCESS_TOKEN', 'SDKWORK_BIRDCODER_ACCESS_TOKEN'];

/**
 * 读取当前部署的 SDKWork 环境。
 * @param {object} ctx - 插件上下文（用于可选地读取 settings 服务）。
 * @param {object} [overrides] - 插件配置里的显式覆盖（运维/测试用）。
 * @returns {{apiBaseUrl: string, accessToken: string, environment: string, origin: 'config'|'settings'|'environment'|'none'}}
 */
export function readSdkworkCatalogSource(ctx, overrides = {}) {
  const resolved = readSettingsProfile(ctx);
  const configuredBaseUrl = trimmed(overrides.apiBaseUrl);
  const configuredToken = trimmed(overrides.accessToken);
  const settingsBaseUrl = trimmed(resolved?.profile?.apiBaseUrl);
  const settingsToken = trimmed(resolved?.profile?.accessToken);
  const environmentBaseUrl = firstEnvironment(HOST_BASE_URL_KEYS);
  const environmentToken = firstEnvironment(HOST_ACCESS_TOKEN_KEYS);
  const apiBaseUrl = configuredBaseUrl || settingsBaseUrl || environmentBaseUrl || '';
  const accessToken = configuredToken || settingsToken || environmentToken || '';
  const origin = configuredBaseUrl || configuredToken
    ? 'config'
    : settingsBaseUrl || settingsToken
      ? 'settings'
      : environmentBaseUrl || environmentToken
        ? 'environment'
        : 'none';
  return {
    apiBaseUrl: stripTrailingSlash(apiBaseUrl),
    accessToken,
    environment: resolved?.environment ?? 'unknown',
    origin,
  };
}

/**
 * 从 `ui-sdkwork-env` 设置段解析当前环境的 profile。
 * @param {object} ctx - 插件上下文。
 * @returns {{environment: string, profile: object}|undefined}
 */
function readSettingsProfile(ctx) {
  const settings = typeof ctx?.get === 'function' ? ctx.get('settings') : undefined;
  if (!settings || typeof settings.describe !== 'function') return undefined;
  let descriptor;
  try {
    descriptor = settings.describe().find((item) => item?.ns === SDKWORK_ENV_SETTINGS_NAMESPACE);
  } catch {
    return undefined;
  }
  const value = descriptor?.value;
  if (!value || typeof value !== 'object') return undefined;
  const environment = SDKWORK_ENVIRONMENTS.includes(value.environment) ? value.environment : undefined;
  if (!environment) return undefined;
  const profile = value[environment];
  return { environment, profile: profile && typeof profile === 'object' ? profile : {} };
}

function trimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function firstEnvironment(keys) {
  for (const key of keys) {
    const value = trimmed(process.env[key]);
    if (value) return value;
  }
  return '';
}

function stripTrailingSlash(url) {
  return url.replace(/\/+$/, '');
}

/**
 * 通过 sdkwork-mcp 的 App SDK 读取整套目录。
 * @param {{apiBaseUrl: string, accessToken: string}} source - 解析好的环境。
 * @param {object} options - 请求选项。
 * @param {number} [options.timeoutMs] - 单页请求超时。
 * @param {AbortSignal} [options.signal] - 取消信号（插件卸载或刷新时触发）。
 * @param {number} [options.pageSize] - 单页条数。
 * @returns {Promise<Array<object>>} 目录条目记录（原始 API 形状）。
 */
export async function fetchSdkworkCatalogEntries(source, { timeoutMs, signal, pageSize } = {}) {
  if (!source?.apiBaseUrl) {
    throw new Error('SDKWork 环境未配置网关地址，无法加载 MCP 连接器目录');
  }
  const client = createClient({
    baseUrl: source.apiBaseUrl,
    ...(source.accessToken ? { accessToken: source.accessToken } : {}),
    ...(Number.isFinite(timeoutMs) && timeoutMs > 0 ? { timeout: timeoutMs } : {}),
  });
  const size = Number.isFinite(pageSize) && pageSize > 0 ? pageSize : CATALOG_PAGE_SIZE;
  const entries = [];
  for (let page = 1; page <= MAX_CATALOG_PAGES; page += 1) {
    signal?.throwIfAborted();
    const result = await client.mcp.listCatalogEntries(
      { page, pageSize: size },
      signal ? { signal } : undefined,
    );
    const items = Array.isArray(result?.items) ? result.items : [];
    entries.push(...items);
    const info = result?.pageInfo ?? {};
    const hasMore = info.hasMore === true
      || (typeof info.nextCursor === 'string' && info.nextCursor.length > 0)
      || (Number.isFinite(info.totalPages) && page < info.totalPages)
      || items.length === size;
    if (!hasMore) break;
  }
  return entries;
}

/**
 * 把一条目录记录映射成连接器描述符。
 *
 * 输出字段与 `schema.js` 的 `connectorDescriptorSchema` 一一对应；缺省字段保持
 * `undefined`（而不是 null），让 zod 的默认值与 `auditDescriptor` 的既有规则
 * 继续生效。
 * @param {object} entry - `McpCatalogEntryRecord`。
 * @returns {object} 连接器描述符。
 */
export function catalogEntryToDescriptor(entry) {
  const descriptor = {
    schemaVersion: 1,
    id: requireText(entry?.entry_key, 'entry_key'),
    name: requireText(entry?.name, 'name'),
    servers: (Array.isArray(entry?.servers) ? entry.servers : []).map(toServerRef),
  };
  if (text(entry.vendor)) descriptor.vendor = text(entry.vendor);
  const icon = text(entry.icon_ref);
  if (icon) descriptor.icon = icon;
  const category = text(entry.category_name) || text(entry.category_code);
  if (category) descriptor.category = category;
  if (text(entry.summary)) descriptor.summary = text(entry.summary);
  if (text(entry.description)) descriptor.description = text(entry.description);
  if (text(entry.homepage)) descriptor.homepage = text(entry.homepage);
  if (Array.isArray(entry.tags) && entry.tags.length > 0) {
    descriptor.tags = entry.tags.filter((tag) => typeof tag === 'string' && tag.length > 0);
  }
  descriptor.published = entry?.published !== false;
  descriptor.featured = entry?.featured === true;
  if (Array.isArray(entry.prompt_variables) && entry.prompt_variables.length > 0) {
    descriptor.promptVariables = entry.prompt_variables;
  }
  if (entry.auth && typeof entry.auth === 'object' && !Array.isArray(entry.auth)) {
    descriptor.auth = entry.auth;
  }
  const prompts = (Array.isArray(entry.prompts) ? entry.prompts : [])
    .map(toPromptSample)
    .filter(Boolean);
  if (prompts.length > 0) descriptor.prompts = prompts;
  return descriptor;
}

function toServerRef(server) {
  const ref = {
    serverKey: requireText(server?.server_key, 'server_key'),
    serverName: requireText(server?.server_name, 'server_name'),
  };
  if (text(server.url)) ref.url = text(server.url);
  if (text(server.command)) ref.command = text(server.command);
  if (Array.isArray(server.args) && server.args.length > 0) ref.args = server.args;
  if (text(server.transport)) ref.transport = text(server.transport);
  const headers = record(server.headers);
  if (headers) ref.headers = headers;
  const env = record(server.env);
  if (env) ref.env = env;
  const bindings = record(server.credential_bindings);
  if (bindings) ref.credentialBindings = bindings;
  const headerBindings = record(server.header_credential_bindings);
  if (headerBindings) ref.headerCredentialBindings = headerBindings;
  if (text(server.oauth_resource)) ref.oauthResource = text(server.oauth_resource);
  if (text(server.oauth_token_env)) ref.oauthTokenEnv = text(server.oauth_token_env);
  if (text(server.cwd)) ref.cwd = text(server.cwd);
  return ref;
}

function toPromptSample(prompt) {
  const title = text(prompt?.title);
  const textValue = text(prompt?.text);
  if (!title || !textValue) return undefined;
  const sample = { title, text: textValue };
  const server = text(prompt?.server_key);
  if (server) sample.server = server;
  return sample;
}

function record(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const keys = Object.keys(value);
  return keys.length > 0 ? value : undefined;
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function requireText(value, field) {
  const resolved = text(value);
  if (!resolved) throw new Error(`连接器目录记录缺少 ${field}`);
  return resolved;
}
