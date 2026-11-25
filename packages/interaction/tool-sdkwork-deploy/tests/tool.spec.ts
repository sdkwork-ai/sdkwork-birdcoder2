/**
 * `sdkwork_deploy_app` publishes one SDKWork application from the conversation.
 *
 * The Host validates the request and relays a scoped `sdkwork-deploy/request`
 * waterfall to the connected client, which owns the IAM session, the project
 * files and the generated deploy/drive clients. The client packs the build
 * output, uploads the immutable artifact, creates the release and the
 * deployment, and answers with the site facts the tool returns.
 */
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import { provideWorkingDirectoryFixture } from '@deepseek-ai/dsh-agent-loop-testkit'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import * as DeployTool from '../src/index.ts'
import type { SdkworkDeployRequestEvent, SdkworkDeployResult, SdkworkDeploySite } from '../src/types.ts'

/** One published site the fixture client answers with. */
const SITE: SdkworkDeployResult & { site: SdkworkDeploySite } = {
  ok: true,
  status: 'published',
  site: {
    appId: 'app-1',
    appName: 'Skyline Analytics',
    appKind: 'PC_WEB',
    siteUrl: 'https://skyline.example.com/',
    domain: 'skyline.example.com',
    environment: 'production',
    version: '1.2.0',
    releaseId: 'release-1',
    deploymentId: 'deployment-1',
    deploymentStatus: 'SUCCEEDED',
    publishedAt: '2026-11-24T10:00:00.000Z',
    packageType: 1,
  },
}

/** Minimal live Agent; the relay only passes the identity through. */
function fakeAgent(): Agent {
  return { id: 'agent-1' } as unknown as Agent
}

/**
 * Boot the tool over a real tool runtime and register one client answerer.
 * @param answer - the client's answer for every request it receives.
 * @returns the booted context, the observed requests, and the call helper.
 */
async function bench(answer: (request: SdkworkDeployRequestEvent) => Promise<SdkworkDeployResult> | SdkworkDeployResult): Promise<{
  ctx: Context
  requests: SdkworkDeployRequestEvent[]
  execute: (args: Record<string, unknown>) => ReturnType<typeof executeToolFixture>
}> {
  const ctx = new Context()
  provideWorkingDirectoryFixture(ctx)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NativeToolExecutor)
  await ctx.plugin(AgentRegistry)
  const fiber = ctx.plugin(DeployTool)
  await fiber
  const requests: SdkworkDeployRequestEvent[] = []
  ctx.on('sdkwork-deploy/request', async (request) => {
    requests.push(request)
    return answer(request)
  })
  const agent = fakeAgent()
  let callNumber = 0
  const execute = (args: Record<string, unknown>) => executeToolFixture(ctx, {
    signal: new AbortController().signal,
    callId: `call-${++callNumber}` as ToolCallId,
    name: 'sdkwork_deploy_app',
    arguments: args,
    agent,
  })
  return { ctx, requests, execute }
}

describe('sdkwork_deploy_app', () => {
  it('registers the tool and relays the request with its form overrides', async () => {
    const { ctx, requests, execute } = await bench(() => SITE)
    expect(ctx.tools.get('sdkwork_deploy_app')).toBeDefined()
    const result = await execute({
      directory: ' D:/work/store ',
      buildOutput: 'dist',
      environment: 'production',
      artifactForm: 'server-bundle',
      deploymentKind: 'ARTIFACT_RELEASE',
      deploymentTarget: 'CONTAINER',
      platformTarget: 'api-service',
      recordSource: false,
    })
    expect(result.isError).toBe(false)
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({
      directory: 'D:/work/store',
      buildOutput: 'dist',
      environment: 'production',
      artifactForm: 'server-bundle',
      packageType: 4,
      deploymentKind: 'ARTIFACT_RELEASE',
      deploymentTarget: 'CONTAINER',
      platformTarget: 'api-service',
      recordSource: false,
    })
    if (result.isError) throw new Error('deploy failed')
    expect(result.value).toMatchObject({
      ok: true,
      status: 'published',
      site: { appId: 'app-1', siteUrl: 'https://skyline.example.com/' },
    })
  })

  it('renders the published site for the model', () => {
    const text = DeployTool.describeResult({ ok: true, status: 'published', site: SITE.site })
    expect(text).toContain('Published Skyline Analytics (app-1) to production')
    expect(text).toContain('https://skyline.example.com/')
    expect(text).toContain('Deployment: deployment-1 — SUCCEEDED')
  })

  it('renders the deployment form, rollback reference and publishing account', () => {
    const text = DeployTool.describeResult({
      ok: true,
      status: 'published',
      site: {
        ...SITE.site,
        deploymentKind: 'ARTIFACT_RELEASE',
        deploymentTarget: 'WEB_NODE',
        previousDeploymentId: 'deployment-0',
        sourceRecorded: true,
        publishedBy: 'Alice',
      },
    })
    expect(text).toContain('Form: ARTIFACT_RELEASE to WEB_NODE')
    expect(text).toContain('Rollback reference: deployment-0')
    expect(text).toContain('Source recorded: yes')
    expect(text).toContain('Published by the signed-in account Alice')
  })

  it('passes a reported failure through with its stage and code', async () => {
    const { execute } = await bench(() => ({
      ok: false,
      status: 'failed',
      stage: 'createDeployment',
      code: 'STAGE_FAILED',
      message: 'platform target rejected the deployment',
    }))
    const result = await execute({ directory: '.' })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('deploy failed')
    expect(result.value).toEqual({
      ok: false,
      status: 'failed',
      stage: 'createDeployment',
      code: 'STAGE_FAILED',
      message: 'platform target rejected the deployment',
    })
  })

  it('renders a failure as the stopping stage', () => {
    expect(DeployTool.describeResult({
      ok: false, status: 'failed', stage: 'uploadArchive', code: 'STAGE_FAILED', message: 'upload rejected',
    })).toBe('Publish failed at uploadArchive (STAGE_FAILED): upload rejected')
  })

  it('fails with NO_CLIENT when no browser client answers', async () => {
    const ctx = new Context()
    provideWorkingDirectoryFixture(ctx)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(NativeToolExecutor)
    await ctx.plugin(AgentRegistry)
    const fiber = ctx.plugin(DeployTool)
    await fiber
    const result = await executeToolFixture(ctx, {
      signal: new AbortController().signal,
      callId: 'call-1' as ToolCallId,
      name: 'sdkwork_deploy_app',
      arguments: {},
      agent: fakeAgent(),
    })
    expect(result.isError).toBe(true)
    if (!result.isError) throw new Error('expected a relay failure')
    expect(result.error.info?.code).toBe('NO_CLIENT')
  })

  it('rejects blank path arguments before relaying', async () => {
    const { execute, requests } = await bench(() => SITE)
    const result = await execute({ directory: '   ' })
    expect(result.isError).toBe(true)
    expect(requests).toHaveLength(0)
  })
})
