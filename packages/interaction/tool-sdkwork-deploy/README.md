---
description: "Model-facing sdkwork_deploy_app tool: validates the project, relays the publish request to the connected signed-in BirdCoder client, and returns the published site facts."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-sdkwork-deploy

English | [中文](README.zh.md)

## Summary

`sdkwork_deploy_app` publishes one SDKWork application from the conversation. The Host validates the request and relays a scoped `sdkwork-deploy/request` waterfall to the connected BirdCoder client, because publishing needs the signed-in IAM session, the project's files and the generated deploy/drive clients — all of which live in the browser. The client packs the build output, uploads the immutable artifact, creates the release and the deployment, and answers with the site facts this tool returns; the client's conversation card and right-sidebar site panel render those facts.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount it in an agent's Cordis composition with `tools` available. The `standard`, `ptc`, and `cordis` agent presets mount it through the Web app preset patch.

The model calls `sdkwork_deploy_app` with the project directory that holds `agent.app.config.json`, optionally a build-output directory relative to that project, the lifecycle environment, the semantic version and release notes. The tool trims blank path arguments (`INVALID_ARGS`), requires an agent Session (`TOOL_CONTEXT_UNAVAILABLE`), and fails with `NO_CLIENT` when no Browser Client answers the forwarded request, which is the headless case.

The answer is a reported publish outcome, not a transport error: `ok: false` carries the stopping stage (`resolveProject`, `resolveApp`, `createApp`, `resolveBuildOutput`, `pack`, `uploadArchive`, `registerArtifact`, `createRelease`, `createDeployment`, `readSite`, `signedOut`, `unavailable`), a stable code and a human-readable message. The tool never retries by itself, so the model reports the stage and changes one thing.

A successful answer is `ok: true` with `site`: application identity and kind, canonical URL and hostname, environment, version, release and deployment ids, the deployment and application status read back after the publish, the creation timestamp and the artifact package type. `ui-sdkwork-deploy` renders these facts as the conversation card and opens them in the `sdkwork-deploy-site` right-sidebar tab.

<a id="understand-the-implementation"></a>
## Understand the implementation

The package is a relay, not a deployment implementation:

1. `execute` validates the arguments and dispatches the scoped `sdkwork-deploy/request` waterfall through `ctx.waterfall(scopeTarget(agent, agent), …)`.
2. `@deepseek-ai/dsh-api-remotes` forwards that waterfall to the Browser Client that carries the same Agent, where `ui-sdkwork-deploy` answers it after running the publish.
3. The tool formats the returned site facts for the model and returns the structured value the card narrows.

`src/types.ts` owns the cross-package vocabulary: the request, the site facts, the failure stages and the `Events` declaration that the Remote allowlist imports. `src/index.ts` owns the tool definition, argument normalization and the model-facing text.

The Host owns none of the publish state: no session event, no projection, no durable file. The client's publish and its card are the only record of a site.

<a id="model-experience"></a>
## Model Experience

### sdkwork_deploy_app

#### What the model sees

The schema asks for the project directory that holds `agent.app.config.json`, an optional build-output directory, the lifecycle environment, a semantic version and release notes. The description states that the signed-in BirdCoder client packs, uploads and deploys, and that a failure names the stage that stopped. Results render one line per fact: the published application and environment, its URL, the release and the deployment status; or one failure line naming the stage, code and detail.

#### Token effect

One tool schema per mounted agent and one short result summary per publish. Site bytes, build output and dashboard records never enter model messages.

#### KV Cache effect

The schema and the result vocabulary are static for the mount lifetime; a publish result extends the conversation without rewriting its prompt prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


- Publishing requires a connected Browser Client with a signed-in IAM session. A headless or terminal-only Session reports `NO_CLIENT`; there is no Host-side credential path, because the deploy API rejects the public application token for user-owned writes.
- The build itself is not run by this tool. The model or the Client's packaging surface must produce the build output first; the tool publishes the directory that exists.
- The published status is read back once, immediately after the deployment is created. A deployment that finishes later is shown as its accepted status in the card; the site panel re-reads it.
- Native mobile, mini-program and desktop installers still need their own packaging commands. The tool publishes the artifact and platform target the manifest describes; a missing build output or platform target is reported, not guessed.

<a id="dev-note"></a>
### Dev Note

The relay exists because the IAM session never leaves the browser: `DeployHost` in `ui-sdkwork-deploy` derives the dual-token client pair from the session and the environment access token, so a Host tool cannot publish on its own. The `sdkwork-deploy/request` allowlist row in `@deepseek-ai/dsh-api-remotes` is the only Host-side registration the bridge needs.
