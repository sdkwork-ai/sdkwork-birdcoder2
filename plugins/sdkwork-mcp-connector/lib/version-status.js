import { readFileSync } from 'node:fs';

/**
 * 版本状态：本插件随 BirdCoder 的应用包一起发布，更新走应用自身的发布通道，
 * 因此这里不再向 npm / GitHub 轮询上游包的最新版本（那是第三方分发模型的做法）。
 * 本模块继续提供面板需要的同一份状态形状：安装版本、是否有可用更新（恒为 false）、
 * 以及最近一次检查时间，让界面的版本区块保持可用而没有外部网络请求。
 */

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

export const INSTALLED_PLUGIN_VERSION = packageJson.version;
export const VERSION_CHECK_TTL_MS = 6 * 60 * 60 * 1000;
export const VERSION_CHECK_FAILURE_TTL_MS = 5 * 60 * 1000;

/** Read only launcher-owned diagnostics, without exposing paths or exception details. */
export function readHostProfileInfo(ctx) {
  try {
    if (typeof ctx?.get !== 'function') return { detectedName: null, status: 'unavailable' };
    const profile = ctx.get('profileContext');
    if (profile == null) return { detectedName: null, status: 'unavailable' };
    const name = profile.name;
    if (typeof name !== 'string' || name === '') {
      return { detectedName: typeof name === 'string' ? name : null, status: 'invalid-value' };
    }
    const safe = name === name.trim() && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) && name !== 'node_modules';
    return { detectedName: name, status: safe ? 'ready' : 'unsupported-name' };
  } catch {
    return { detectedName: null, status: 'read-error' };
  }
}

/** Compatibility helper: only names safe for a CLI argument are returned. */
export function readHostProfileName(ctx) {
  const info = readHostProfileInfo(ctx);
  return info.status === 'ready' ? info.detectedName : null;
}

function normalizeVersion(value) {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().replace(/^v/i, '');
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(normalized)
    ? normalized
    : undefined;
}

function parseVersion(value) {
  const normalized = normalizeVersion(value);
  if (!normalized) return undefined;
  const [withoutBuild] = normalized.split('+');
  const [core, prerelease] = withoutBuild.split('-', 2);
  return {
    normalized,
    core: core.split('.').map(Number),
    prerelease: prerelease?.split('.') ?? [],
  };
}

/** Compare two semantic versions. Returns a positive number when `left` is newer. */
export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return 0;
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index] - b.core[index];
  }
  if (a.prerelease.length === 0 && b.prerelease.length > 0) return 1;
  if (a.prerelease.length > 0 && b.prerelease.length === 0) return -1;
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const aPart = a.prerelease[index];
    const bPart = b.prerelease[index];
    if (aPart === undefined) return -1;
    if (bPart === undefined) return 1;
    if (aPart === bPart) continue;
    const aNumeric = /^\d+$/.test(aPart);
    const bNumeric = /^\d+$/.test(bPart);
    if (aNumeric && bNumeric) return Number(aPart) - Number(bPart);
    if (aNumeric) return -1;
    if (bNumeric) return 1;
    return aPart.localeCompare(bPart);
  }
  return 0;
}

export function isVersionNewer(candidate, installed) {
  return compareVersions(candidate, installed) > 0;
}

/**
 * 版本状态服务：只报告随应用发布的安装版本。
 *
 * 面板与宿主共用这份结构，所以字段与旧实现保持一致；`updateAvailable` 恒为
 * `false`，`latestVersion` 等于安装版本，界面因此不出现「有新版本」的提示。
 * @param {object} [options] - 测试可注入时钟。
 * @param {string} [options.installedVersion] - 覆盖安装版本。
 * @param {() => number} [options.now] - 时钟。
 * @returns {{status: (options?: {force?: boolean}) => object, check: (options?: {force?: boolean}) => Promise<object>, dispose: () => void}}
 */
export function createVersionStatusService({
  installedVersion = INSTALLED_PLUGIN_VERSION,
  now = () => Date.now(),
  cacheTtlMs = VERSION_CHECK_TTL_MS,
} = {}) {
  let cached;
  let expiresAt = 0;

  function build() {
    const checkedAtMs = now();
    const version = installedVersion;
    const result = {
      installedVersion: version,
      latestVersion: version,
      updateAvailable: false,
      releasePending: false,
      checking: false,
      status: 'ok',
      checkedAt: new Date(checkedAtMs).toISOString(),
      nextCheckAt: new Date(checkedAtMs + cacheTtlMs).toISOString(),
      // 随应用发布：没有可点击的 npm 包页与 releases 页。
      npmPackageUrl: '',
      releasesUrl: '',
      release: null,
      sources: {
        npm: { ok: true, version },
        github: { ok: true, version },
      },
    };
    expiresAt = checkedAtMs + cacheTtlMs;
    cached = result;
    return result;
  }

  async function check({ force = false } = {}) {
    if (!force && cached && now() < expiresAt) return cached;
    return build();
  }

  function status({ force = false } = {}) {
    if (force || !cached || now() >= expiresAt) build();
    return { ...cached, checking: false };
  }

  function dispose() {}

  return { status, check, dispose };
}
