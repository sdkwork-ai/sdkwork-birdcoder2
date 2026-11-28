/**
 * 连接器目录：SDKWork 云端目录 + config 注入 + 本地覆盖（上架/下架开关）。
 *
 * 合并键为 id，优先级：本地覆盖 > config.connectors > 云端目录。
 * 云端目录由 `sdkwork-catalog.js` 通过 sdkwork-mcp 的 App SDK 读取，本模块只负责
 * 审计、合并、查询，以及把「当前已上架的公开目录」作为分享模板的信任根。
 */
import { normalizeConnectorDescriptor } from './schema.js';
import { assertSafeUrl, assertSafeHeaderName } from './util.js';
import { DEFAULT_LOCALE, createTranslator } from './i18n/index.js';

/** 缺省译文：中文（既有调用点与测试无需改动）。 */
const tZh = createTranslator(DEFAULT_LOCALE);

const MAX_CATALOG_BYTES = 2 * 1024 * 1024;

const SECRET_KEY_RE = /^(?:access[-_]?token|refresh[-_]?token|token|api[-_]?key|secret|client[-_]?secret|password|authorization)$/i;
const SECRET_ENV_RE = /(?:token|secret|api[_-]?key|password|authorization|credential)/i;

/** 在 zod 丢弃未知字段前扫描原始 JSON，避免把夹带的 token 静默忽略。 */
export function auditRawDescriptor(raw, path = 'connector', { t = tZh } = {}) {
  if (!raw || typeof raw !== 'object') return raw;
  for (const [key, value] of Object.entries(raw)) {
    const fieldPath = `${path}.${key}`;
    // credentialBindings 的 key 是待注入的环境变量名，value 只能是凭据字段引用；
    // 真实值会在本机表单提交后写入 ConnectionRecord，不允许出现在目录中。
    if (key === 'credentialBindings' || key === 'headerCredentialBindings') continue;
    // credentialFields[].secret 只是“以密码框显示”的布尔声明，不是密钥值。
    if (key === 'secret' && typeof value === 'boolean' && /\.auth\.(?:credentialFields|headerCredentialFields)\.\d+\.secret$/.test(fieldPath)) continue;
    if (SECRET_KEY_RE.test(key) && value !== undefined && value !== null && String(value).trim() !== '') {
      throw new Error(t('{fieldPath} 禁止携带凭证或密钥', { fieldPath }));
    }
    if (typeof value === 'object') auditRawDescriptor(value, fieldPath, { t });
  }
  return raw;
}

/**
 * 分享模板的信任根：最近一次成功加载的云端目录（只含已上架连接器）。
 *
 * 目录不再是随包发布的 JSON，因此信任根跟着运行中的部署走：`recomputeMerged`
 * 每次重算都会用当前云端目录替换这份快照，而分享校验只读快照，不读本地覆盖、
 * 不读 config 注入的连接器——与既有语义一致（只有市场公开条目可被分享）。
 */
let publishedSnapshot = [];

/**
 * 用最新的云端目录替换信任根快照。
 * @param {Array<object>} descriptors - 已归一化、已审计的连接器描述符。
 */
export function setPublishedCatalogSnapshot(descriptors) {
  publishedSnapshot = Array.isArray(descriptors) ? descriptors : [];
}

/**
 * 读取当前信任根快照。
 * @returns {Array<object>} 已上架的连接器描述符。
 */
export function publishedCatalogSnapshot() {
  return publishedSnapshot;
}

/** Sharing trust root: the published cloud catalog only, never merged/config/override sources. */
export function publishedCatalogTemplateReferences() {
  return publishedSnapshot.filter((item) => item.published !== false).flatMap((item) => {
    const descriptor = auditDescriptor(item);
    return descriptor.servers.map((server) => ({
      connectorId: descriptor.id,
      serverKey: server.serverKey,
      name: descriptor.name,
      serverName: server.serverName,
    }));
  });
}

/** 安全审计：目录禁止携带密钥、URL 协议白名单、header 名白名单。 */
export function auditDescriptor(descriptor, { t = tZh } = {}) {
  const oauthHttpResources = new Set(
    descriptor.servers
      .filter((server) => ['streamable-http', 'sse'].includes(server.transport))
      .map((server) => server.oauthResource ?? server.url),
  );
  const credentialFields = descriptor.auth.credentialFields ?? [];
  const credentialKeys = new Set();
  for (const field of credentialFields) {
    if (credentialKeys.has(field.key)) throw new Error(t('connector "{id}" auth.credentialFields key 重复: {key}', { id: descriptor.id, key: field.key }));
    credentialKeys.add(field.key);
  }
  const referencedCredentials = new Set();
  for (const server of descriptor.servers) {
    const headerBindings = server.headerCredentialBindings ?? {};
    if (Object.keys(headerBindings).length) {
      if (server.transport === 'stdio' || descriptor.auth.mode !== 'api-key') {
        throw new Error('headerCredentialBindings requires an HTTP API Key connector');
      }
      const headerNames = new Set(Object.keys(server.headers ?? {}).map(name => name.toLowerCase()));
      for (const [name, key] of Object.entries(headerBindings)) {
        assertSafeHeaderName(name);
        if (/^(host|cookie|set-cookie|proxy-authorization|content-length|transfer-encoding|connection|content-type|accept|origin|referer|mcp-session-id|mcp-protocol-version)$/i.test(name)) {
          throw new Error('headerCredentialBindings cannot bind protocol or routing headers');
        }
        if (headerNames.has(name.toLowerCase())) throw new Error('duplicate credential header');
        if (!credentialKeys.has(key)) throw new Error('unknown header credential field');
        headerNames.add(name.toLowerCase());
        referencedCredentials.add(key);
      }
    }
    if (server.transport === 'stdio') {
      for (const name of Object.keys(server.env ?? {})) {
        if (SECRET_ENV_RE.test(name)) {
          throw new Error(t('connector "{id}" servers[].env 禁止携带密钥类变量: {name}', { id: descriptor.id, name }));
        }
      }
      const bindings = server.credentialBindings ?? {};
      if (descriptor.auth.mode === 'oauth2-pkce') {
        if (Object.keys(bindings).length > 0) {
          throw new Error(t('connector "{id}" 的 OAuth stdio server 不能同时声明 credentialBindings', { id: descriptor.id }));
        }
        if (!server.oauthResource || !server.oauthTokenEnv) {
          throw new Error(t('connector "{id}" 的 OAuth stdio server 必须声明 oauthResource 和 oauthTokenEnv', { id: descriptor.id }));
        }
        assertSafeUrl(server.oauthResource);
        if (!oauthHttpResources.has(server.oauthResource)) {
          throw new Error(t('connector "{id}" 的 OAuth stdio oauthResource 必须引用同一连接器的 HTTP resource', { id: descriptor.id }));
        }
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(server.oauthTokenEnv)) {
          throw new Error(t('connector "{id}" oauthTokenEnv 环境变量名非法: {env}', { id: descriptor.id, env: server.oauthTokenEnv }));
        }
        if (Object.hasOwn(server.env ?? {}, server.oauthTokenEnv)) {
          throw new Error(t('connector "{id}" oauthTokenEnv 与 servers[].env 重复声明: {env}', { id: descriptor.id, env: server.oauthTokenEnv }));
        }
        continue;
      }
      if (server.oauthResource || server.oauthTokenEnv) {
        throw new Error(t('connector "{id}" 只有 OAuth stdio server 可声明 oauthResource/oauthTokenEnv', { id: descriptor.id }));
      }
      if (descriptor.auth.mode === 'none' && Object.keys(bindings).length > 0) {
        throw new Error(t('connector "{id}" 的 stdio credentialBindings 需要 bearer/api-key 凭据定义', { id: descriptor.id }));
      }
      if (['bearer', 'api-key'].includes(descriptor.auth.mode) && Object.keys(bindings).length === 0) {
        throw new Error(t('connector "{id}" 的凭据型 stdio server 必须声明 credentialBindings', { id: descriptor.id }));
      }
      for (const [envName, credentialKey] of Object.entries(bindings)) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(envName)) {
          throw new Error(t('connector "{id}" credentialBindings 环境变量名非法: {env}', { id: descriptor.id, env: envName }));
        }
        if (Object.hasOwn(server.env ?? {}, envName)) {
          throw new Error(t('connector "{id}" credentialBindings 与 servers[].env 重复声明: {env}', { id: descriptor.id, env: envName }));
        }
        if (!credentialKeys.has(credentialKey)) {
          throw new Error(t('connector "{id}" credentialBindings 引用了未知凭据字段: {key}', { id: descriptor.id, key: credentialKey }));
        }
        referencedCredentials.add(credentialKey);
      }
      continue;
    }
    assertSafeUrl(server.url);
    // HTTP Server 可声明 oauthResource：实际请求仍用 url（允许带查询参数，如 `?tools=`），
    // 但 OAuth resource 标识、authorizedResources 与刷新参数使用该规范值。
    if (server.oauthResource) {
      if (descriptor.auth.mode !== 'oauth2-pkce') {
        throw new Error(t('connector "{id}" 只有 oauth2-pkce 卡片可声明 oauthResource: {resource}', { id: descriptor.id, resource: server.oauthResource }));
      }
      assertSafeUrl(server.oauthResource);
      if (new URL(server.oauthResource).origin !== new URL(server.url).origin) {
        throw new Error(t('connector "{id}" oauthResource 必须与 server.url 同源: {resource}', { id: descriptor.id, resource: server.oauthResource }));
      }
    }
    if (server.oauthTokenEnv) {
      throw new Error(t('connector "{id}" 只有 OAuth stdio server 可声明 oauthTokenEnv', { id: descriptor.id }));
    }
    for (const name of Object.keys(server.headers ?? {})) {
      assertSafeHeaderName(name);
      if (/authorization|token|secret|api[-_]?key/i.test(name)) {
        throw new Error(t('connector "{id}" servers[].headers 禁止携带密钥类头: {name}', { id: descriptor.id, name }));
      }
    }
  }
  if (descriptor.auth.mode === 'oauth2-pkce' && oauthHttpResources.size === 0) {
    throw new Error(t('connector "{id}" 的 OAuth 授权至少需要一个 HTTP resource', { id: descriptor.id }));
  }
  if (['bearer', 'api-key'].includes(descriptor.auth.mode)) {
    const httpServers = descriptor.servers.filter((server) => ['streamable-http', 'sse'].includes(server.transport));
    if (httpServers.some(server => !Object.keys(server.headerCredentialBindings ?? {}).length) && credentialFields[0]) referencedCredentials.add(credentialFields[0].key);
    for (const field of credentialFields) {
      if (field.required && !referencedCredentials.has(field.key)) {
        throw new Error(t('connector "{id}" 必填凭据字段未被 HTTP 或 stdio 使用: {key}', { id: descriptor.id, key: field.key }));
      }
    }
  }
  return descriptor;
}

export async function readLimitedJson(response, maxBytes = MAX_CATALOG_BYTES, { t = tZh } = {}) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error(t('JSON 响应超过 {maxBytes} bytes', { maxBytes }));
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new Error(t('JSON 响应超过 {maxBytes} bytes', { maxBytes }));
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    throw new Error(t('JSON 解析失败: {error}', { error: error instanceof Error ? error.message : String(error) }));
  }
}

/** 本机未发布草案不可遮蔽同 id 的正式公开卡片；其他动态卡片仍可覆盖。 */
export function visibleDynamicDescriptors(remote, dynamic) {
  const publishedRemoteIds = new Set(remote.filter((d) => d.published !== false).map((d) => d.id));
  return dynamic.filter((d) => d.published !== false || !publishedRemoteIds.has(d.id));
}

/** 合并多层来源（sources 为低→高优先级的 descriptor 数组），再应用本地覆盖。 */
export function mergeCatalog(sources, overrides = new Map()) {
  const merged = new Map();
  for (const list of sources) {
    for (const descriptor of list) {
      merged.set(descriptor.id, descriptor);
    }
  }
  for (const [id, patch] of overrides) {
    const current = merged.get(id);
    if (!current) continue;
    const next = { ...current };
    if (typeof patch.published === 'boolean') next.published = patch.published;
    if (typeof patch.featured === 'boolean') next.featured = patch.featured;
    merged.set(id, next);
  }
  return [...merged.values()];
}

/** 目录查询（publishedOnly 默认只显示已上架） */
export function listCatalog(merged, { category, keyword, publishedOnly = true } = {}) {
  let list = merged;
  if (publishedOnly) list = list.filter((d) => d.published !== false);
  if (category) list = list.filter((d) => d.category === category);
  if (keyword) {
    const kw = String(keyword).toLowerCase();
    list = list.filter((d) =>
      [d.id, d.name, d.vendor, d.category, d.summary, d.description, ...(d.tags ?? [])]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(kw)),
    );
  }
  // 精选位优先；同级保留目录声明顺序，便于维护明确的市场陈列顺序。
  return [...list].sort((a, b) => (b.featured === true) - (a.featured === true));
}
