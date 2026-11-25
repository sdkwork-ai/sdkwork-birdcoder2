# Application lifecycle reference

Read this when the task covers more than "build and publish once": a first
release, a re-release, a rollback, or an operation beside the publish.

The deploy **platform** lifecycle has four persisted facts, in order:

1. the **application** (`deploy_app`) and its platform target;
2. the **artifact** (an immutable archive or binary) and the **source** that
   produced it;
3. the **release** (an immutable version of one artifact for one target);
4. the **deployment** (a release applied to one environment).

This model is owned by `APPLICATION_FACTORY_DEPLOYMENT_SPEC.md` §2–§3
(five concepts, `deploy_app` status DRAFT → ACTIVE → PAUSED → ARCHIVED, durable
stage state), `DEPLOYMENT_SPEC.md` §1.4 (development/release/deploy side-effect
boundaries) and `RELEASE_SPEC.md` §2.1/§4/§5 (immutable artifacts, per-target
evidence, rollback). The repository's own
`deployments/deploy.yaml` apply procedure is a different, host-level operation
(see `standards/SDKWORK_DEPLOY_SPEC.md`); this skill's publish never edits it.

`deployments` accepts a deployment; it does not make a release live by itself.
Read the deployment back before reporting success.

## Stage map

| Stage | Persisted result | Owner in the conversation flow |
|---|---|---|
| Resolve or create the application | `deploy_app` record, project linkage | `sdkwork_deploy_app` |
| Record the source | `app.source` (archive artifact or Git repository) | `sdkwork_deploy_app` (archive), console (Git) |
| Build and package | local build output, ZIP or binary | the model runs the project's own command |
| Upload and register the artifact | `deploy_artifact` + Drive node | `sdkwork_deploy_app` |
| Create the release | `deploy_release` with a semantic version | `sdkwork_deploy_app` |
| Create the deployment | `deploy_deployment` for one environment | `sdkwork_deploy_app` |
| Verify | deployment status, hostname binding, health checks | `sdkwork_deploy_app` reads it once; the site panel re-reads it |
| Roll back | a new deployment of an older release | a new `sdkwork_deploy_app` call with that version, or the console |

## Operations beside the publish

These are management operations, not part of one publish attempt. Do them in the
site panel or the deployments console unless the request also asks for tool
coverage:

| Operation | Surface | Note |
|---|---|---|
| Activate, pause, archive the application | deployments console | a lifecycle transition, not a deploy |
| Custom domains, TLS, bindings | site panel → 站点管理, or the console | verification is asynchronous |
| Environment variables, database profiles, migrations | console | secrets never travel through the conversation |
| Health checks | site panel → 观测数据 | probes run on the platform, not in the Session |
| Environments and promotions | console | a promotion is its own deployment |
| Git source binding | console or the app library's 源码 action | an archive source is recorded by the publish |
| Usage and metering | console | tenant-wide, not traffic analytics |
| Web traffic and page views | not provided by this platform | do not fabricate them; the panel shows deployments and health instead |
| Host `deployments/deploy.yaml` apply/rollback | the repository's pipeline or console | a host deployment, not a platform publish |

## Versions

Semantic versions are immutable and unique per application. The flow derives the
next patch over the newest release; an explicitly requested version that already
exists is bumped until it is free. Never rebuild or re-upload the same version to
"update" it — cut a new version.

## Rollback

There is no rollback endpoint. A rollback is a **new deployment of the release
you want to serve**: create the release's deployment again for the same target
and environment. The previous deployment id the publish reports is the
reference; the console owns the operation and its approval.

## Verification evidence

- the artifact id and its SHA-256;
- the release id and semantic version;
- the deployment id, its kind and target, and the status read back;
- the environment;
- the canonical hostname (or the platform's default hostname before a binding
  is read);
- the previous deployment id that remains the rollback reference.
