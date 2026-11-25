# Agent Note: Deploy from the conversation

Status: implemented

English | [中文](2026-11-24-deploy-from-conversation.zh.md)

## Problem

The deploy plugin's publish flows were all UI surfaces: the user opened the app library or a session
row menu and filled a dialog. The conversation could describe a deploy but never run one, so "deploy
this and publish it" ended with the user doing the last step by hand. The deployment API needs the
signed-in IAM session, which is per-browser state; a Host process cannot call it, and the public
application access token is rejected for user-owned writes. Showing the site after a publish was
also impossible: nothing recorded the site facts anywhere the transcript could read.

## Decision

The conversation publish is a Host tool that relays to the client, plus a client executor, a result
card and a right-Sidebar site panel.

- `@deepseek-ai/dsh-tool-sdkwork-deploy` registers the model-facing `sdkwork_deploy_app` tool. It
  validates the arguments, dispatches the scoped `sdkwork-deploy/request` waterfall, and returns the
  site facts or the stopping stage and code. It owns no credentials and no layout.
- `sdkwork-deploy/request` is a forwarded waterfall in `@deepseek-ai/dsh-api-remotes`, so the Host
  event reaches the connected Browser Client that carries the same Agent. The client answers it with
  `ui-sdkwork-deploy`'s executor: sign-in gate, project read, application creation and linkage,
  build-output resolution, packaging, next version, platform target, the four-stage
  `createDeployApplicationPublisher` call, source recording, a deployment read-back and the site
  read. The request may override the artifact form, platform target and deployment kind/target, so a
  publishing form the manifest does not describe (a store submission, an OTA drop, a container
  rollout) is expressible without a second flow. The result reports the previous deployment id as
  the rollback reference and the signed-in account that published. A headless Session answers
  `NO_CLIENT`; a signed-out client answers `signedOut`.
- The tool records the structured result as presentation metadata, and the client registers a
  `tool.call.toolview` card under the tool's name: a running row, the published site with its cover
  image (manifest preview, else screenshot, else icon), copy control and panel affordance, or the
  reported failure. The card shows the canonical hostname, or the platform's default
  `<label>.app.<suffix>` (marked `domainDefault`) before a binding is read. Selecting the published
  card calls `ctx.sidebarRight.openContent('sdkwork-deploy-site', { site }, { key: appId })`.
- The `sdkwork-deploy-site` tab type renders the site panel: header, observation metrics and health
  checks, application/hostnames/platform targets, deployment and release history, and the latest
  deployment's log facts. The panel re-reads the live dashboard through the same host adapter on
  open and on refresh.
- `birdcoder-app-deploy` ships in the builtin skill catalog (mirrored at `.agents/skills/` and named
  by both scene projections) and teaches the model the workspace workflow: read the manifest,
  preflight, build, choose the tier and publishing form, call the tool, read the stopping stage, and
  report the live site. It loads progressively: `SKILL.md` carries the workflow and a table of the
  references it opens only when the task needs them (`lifecycle.md`, `app-standards.md`,
  `deployment-targets.md`, `troubleshooting.md`, and the six distilled `standards/` contracts), plus
  `scripts/preflight.mjs` (offline manifest/build checker), `scripts/standards.mjs` (checkout or
  bundled resolution) and `scripts/selfcheck.mjs` (package completeness). The package ships
  `skill.manifest.json` and `references/standards.lock.json`, so it works on a machine without a
  `sdkwork-specs` checkout and proves its own completeness; see
  [portable skill packages](../architecture/2026-11-24-portable-skill-packages.md).

## Related

- The UI publish entry, its app linkage and its dialogs stay owned by
  [the project publish entry note](2026-10-23-project-publish-entry-and-canonical-app-linkage.md);
  this note adds the conversation path beside them.

## Alternatives considered

- **Open the existing publish dialog from the conversation.** Rejected: the dialog's selection
  steps are the work the request asked the agent to do, and the result never reaches the transcript
  as a site the panel can open.
- **Publish from the Host with an operator credential.** Rejected: the deploy API rejects the
  public application token for user-owned writes, and `DeployHost` derives its dual-token clients
  from the IAM session that only the browser holds. A host-side path would need a second credential
  contract that the product does not have.
- **Rewrite the publish sequence in a second implementation.** Rejected: the composed
  `createDeployApplicationPublisher` already runs upload, artifact, release and deployment in one
  order with idempotency keys, and `packScaffoldApp` already packs bounded project bytes with
  sensitive-file exclusion. The conversation executor composes those instead of copying them.
- **Put the skill at the repository root `skills/`.** Rejected: the user Workspace is never this
  repository, so a checkout-local directory cannot serve the product's conversations. The builtin
  catalog is the shipped container; the root `skills/` location is for repository-wide maintenance
  workflows, which this is not.

## Consequences

The capability requires a connected, signed-in Browser Client; a CLI or headless Session can only
report `NO_CLIENT`. An installed app build that predates this package still serves the skill, so the
skill states the degraded path instead of promising a tool that build lacks: use the in-app publish
entry and never call the deploy API directly. The executor reads the deployment once right after
creation, so a deployment still rolling out shows its accepted status on the card while the panel's
refresh reads the live record. The per-card artifact form and deployment plan (web to `WEB_NODE`,
API services to `CONTAINER`, store cards to their review or store target) are defaults; a form the
manifest does not describe is expressed through the request overrides, and the deployments console
still owns targets and transitions the platform rejects. In exchange, the agent can complete a
create-publish-verify lifecycle end to end on the account already signed in, the transcript keeps a
durable site card, and the right Sidebar carries the site's live records without a second console.

## Verification

- `pnpm exec vitest run packages/interaction/tool-sdkwork-deploy packages/client/ui-sdkwork-deploy`
  covers the tool relay and its form overrides, the executor's pre-network failures, the dashboard
  read, the cover/domain card and the panel.
- `pnpm exec vitest run packages/skill/sdkwork-builtin-skills scripts/verify-skill-portability.spec.ts`
  covers the packaged skill set, the preflight script, the standards resolver, the selfcheck and the
  portability gate.
- `pnpm run verify-skill-portability` and `pnpm run verify-skill-package` prove every product skill
  is self-contained and the package lock is current.
- `pnpm run verify-builtin-scene-skills` proves the new skill ships and both projections name it.
- `pnpm exec tsc -b packages/interaction/tool-sdkwork-deploy packages/api/remotes/tsconfig.host.json
  packages/api/remotes/tsconfig.client.json` proves the relay type face.
