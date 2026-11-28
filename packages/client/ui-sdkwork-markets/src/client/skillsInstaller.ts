/**
 * Browser client for the Host installer routes
 * (`@deepseek-ai/dsh-sdkwork-skillhub`). The page reads what is installed from
 * the Host ledger, installs a catalog record's real files, and toggles or
 * removes an installation; the Host owns the filesystem and the upstream
 * downloads, so this module only speaks the small JSON contract.
 */
import type {
  SkillhubDetail,
  SkillhubEnabledResult,
  SkillhubInstallResult,
  SkillhubInstalledPayload,
  SkillhubInstalledSkill,
  SkillhubUninstallResult,
} from '@deepseek-ai/dsh-sdkwork-skillhub/shared'
import {
  SKILLHUB_DETAIL_ROUTE,
  SKILLHUB_ENABLED_ROUTE,
  SKILLHUB_INSTALL_ROUTE,
  SKILLHUB_INSTALLED_ROUTE,
  SKILLHUB_UNINSTALL_ROUTE,
} from '@deepseek-ai/dsh-sdkwork-skillhub/shared'

/** A Host route answered with a coded failure. */
export class SkillInstallerError extends Error {
  constructor(
    /** Stable code from the Host (`unsupported-coordinate`, `checksum`, …). */
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'SkillInstallerError'
  }
}

async function request<T>(route: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(route, {
      ...init,
      headers: { accept: 'application/json', ...(init?.body === undefined ? {} : { 'content-type': 'application/json' }) },
    })
  } catch (error) {
    throw new SkillInstallerError('unreachable', error instanceof Error ? error.message : String(error))
  }
  const body: unknown = await response.json().catch(() => undefined)
  if (!response.ok) {
    const failure = body as { code?: unknown; message?: unknown } | undefined
    throw new SkillInstallerError(
      typeof failure?.code === 'string' ? failure.code : `http-${String(response.status)}`,
      typeof failure?.message === 'string' ? failure.message : `HTTP ${String(response.status)}`,
    )
  }
  return body as T
}

/** Skills the Host currently holds, enabled or disabled. */
export async function listInstalledSkills(): Promise<readonly SkillhubInstalledSkill[]> {
  const payload = await request<SkillhubInstalledPayload>(SKILLHUB_INSTALLED_ROUTE)
  return payload.skills
}

/** Install (or update) one catalog record into the Harness skill root. */
export async function installSkill(packageKey: string, version?: string): Promise<SkillhubInstallResult> {
  return request<SkillhubInstallResult>(SKILLHUB_INSTALL_ROUTE, {
    method: 'POST',
    body: JSON.stringify(version === undefined ? { packageKey } : { packageKey, version }),
  })
}

/** Remove an installed record from both roots. */
export async function uninstallSkill(packageKey: string): Promise<SkillhubUninstallResult> {
  return request<SkillhubUninstallResult>(SKILLHUB_UNINSTALL_ROUTE, {
    method: 'POST',
    body: JSON.stringify({ packageKey }),
  })
}

/** Move an installed record between the enabled and disabled roots. */
export async function setSkillEnabled(packageKey: string, enabled: boolean): Promise<SkillhubEnabledResult> {
  return request<SkillhubEnabledResult>(SKILLHUB_ENABLED_ROUTE, {
    method: 'POST',
    body: JSON.stringify({ packageKey, enabled }),
  })
}

/** Upstream versions, security reports and file list for one record. */
export async function fetchSkillDetail(packageKey: string, version?: string): Promise<SkillhubDetail> {
  const query = new URLSearchParams({ packageKey })
  if (version !== undefined) query.set('version', version)
  return request<SkillhubDetail>(`${SKILLHUB_DETAIL_ROUTE}?${query.toString()}`)
}
