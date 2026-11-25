---
name: birdcoder-app-deploy
description: Use when a project must be deployed or published from the conversation - resolve the SDKWork application its agent.app.config.json describes, preflight and build it, publish it with sdkwork_deploy_app on the account already signed in to this app, and report the live site, the deployment and its rollback reference.
---

# Deploy an SDKWork application

Publish one SDKWork application from its project directory, end to end:
resolve or create the application, record its source, build and package, upload
the immutable artifact, cut the release, create the deployment, verify it, and
report the rollback reference. The application record, build declaration and
environment facts stay in `agent.app.config.json` and `etc/`; artifacts and
releases stay on the SDKWork deploy platform.

The publish runs in this app's signed-in client against the account already
signed in here. The skill never asks for a password, token or second login, and
never calls the deploy API directly.

This skill is a directory package, not a single file: it needs the `references/`
and `scripts/` beside this entrypoint. Installing only `SKILL.md` is incomplete;
`node scripts/selfcheck.mjs --strict` reports what is missing.

## When to use

Use this skill when the user asks to deploy, publish, release, ship or
re-deploy a project, and when a deploy is the last step of another workflow (a
new page, a fixed bug, a rebuilt app).

Do not use it for:

- publishing an app scaffold, or installing one into a project - those are
  separate deploy surfaces;
- platform domains, TLS, gateway administration or database migrations - those
  are control-plane operations, not a publish;
- a project with no `agent.app.config.json` and no clear application type - stop
  and ask which application the project is;
- a deployment this platform does not provide (page-view analytics, per-request
  serverless uploads) - say so instead of approximating it.

## Inputs

- The project directory, defaulting to the Session's working directory.
- `agent.app.config.json`: `app`, `runtime`, `publish.platforms`,
  `metadata.publishing`.
- The project's own build command and its build output directory.
- The target lifecycle tier: `development`, `test`, `staging`, `demo` or
  `production`.
- A signed-in BirdCoder client. Publishing needs the app's IAM session; a
  terminal-only Session cannot publish, and no other credential is accepted.

Deeper material, read only when the task needs it. The paths are relative to this
skill's directory, which the skill catalog reports as an absolute path:

| File | Read when |
|---|---|
| [references/lifecycle.md](references/lifecycle.md) | planning a first release, a re-release, a rollback, or an operation beside the publish (domains, environment variables, health, promotions) |
| [references/app-standards.md](references/app-standards.md) | the project's type, build output or publishing form is unclear, or the manifest family does not resolve to a console card |
| [references/deployment-targets.md](references/deployment-targets.md) | choosing or overriding `artifactForm`, `platformTarget`, `deploymentKind`, `deploymentTarget`, or reading a rejected deployment |
| [references/troubleshooting.md](references/troubleshooting.md) | a publish returned `ok: false`, this app build has no `sdkwork_deploy_app`, or the installation looks incomplete |
| [references/standards/](references/standards/) | you need the normative field/rule detail: manifest v3, packaging, env profiles, deploy layout, client architecture |
| [scripts/preflight.mjs](scripts/preflight.mjs) | always, before the first publish attempt of a project |
| [scripts/standards.mjs](scripts/standards.mjs) | you need to know whether a live `sdkwork-specs` checkout or the bundled contract is in force |
| [scripts/selfcheck.mjs](scripts/selfcheck.mjs) | a reference or script could not be read, or you are verifying an installation |

## Workflow

1. **Preflight the project.** From this skill's directory (the catalog reports its absolute path), run the offline checker:

   ```bash
   node scripts/preflight.mjs <project-directory> [--build-output <relative-path>]
   ```

   It reads the manifest, validates its required sections, derives the
   application family and console type card, resolves the build output (including
   the adaptive-web `dist/<profile>/<env>/` layout), and reports the project's own
   build command. When a `sdkwork-specs` checkout is reachable it also runs the
   official manifest checker; without one the bundled contracts are authoritative
   and the publish still proceeds. Exit code 0 means the manifest and output are
   publishable; 1 names what is missing. It makes no network call and holds no
   credential. Fix `MANIFEST_*` and `BUILD_OUTPUT_MISSING` findings before
   publishing.
2. **Resolve the application.** The preflight's `identity.cardId` is the console
   type card. If it is absent, the manifest does not determine one type: fix the
   manifest (`references/app-standards.md`) instead of guessing.
3. **Build with the project's own command.** Use the command the preflight
   reports. Confirm the output directory it names exists afterwards. Publishing
   a directory that was never built ships stale bytes.
4. **Choose the tier and form.** The manifest's default profile tier unless the
   user names one. Do not publish to `production` unless the request names
   production or the app already serves there. The artifact form and deployment
   target follow the application type; override them only when the deployment
   form differs (`references/deployment-targets.md`), and say why.
5. **Publish.** Call `sdkwork_deploy_app` with:
   - `directory` - the project root (omit for the Session's working directory);
   - `buildOutput` - the output path relative to the project root, when it is
     not the conventional `dist/`, `build/`, `out/`, `.output/` or `public/`.
     An adaptive PC+H5 web pair publishes one
     `dist/<standalone|cloud>/<dev|test|staging|prod>/` directory, never the
     whole `dist/`;
   - `environment` - the chosen tier;
   - `version` - only when the user names a version; otherwise the next patch is
     derived and an already-taken version is bumped;
   - `releaseNotes` - a short note for the release;
   - `artifactForm` / `platformTarget` / `deploymentKind` / `deploymentTarget` -
     only for a form the manifest does not describe;
   - `recordSource` - leave default (true) unless the user asks for an
     artifact-only upload.
6. **Verify.** On `ok: true`, read the result: application id, environment,
   site URL (canonical, or the platform's default hostname marked
   `domainDefault`), version and release id, deployment id and status (read
   back, not assumed), the previous deployment id, whether the source was
   recorded, and the publishing account. The conversation now shows the
   published-site card with the application's cover image and domain; selecting
   it opens the site panel for hostnames, releases, deployments and the latest
   deployment's facts.
7. **Handle a failure.** `ok: false` names the stage and code
   (`references/troubleshooting.md`). Fix that stage and call the tool once
   more with a new version. Do not retry the same inputs, and do not report a
   publish as done from the release alone.
8. **Roll back when asked.** A rollback is a new deployment of an older release:
   publish that version again, or use the console. The previous deployment id
   from the last publish is the reference; approval stays with the user.

## Rules

- **Standards.** The distilled contracts in `references/standards/` are the
  operational authority for this workflow and travel with the skill, so the
  publish works on a machine without a `sdkwork-specs` checkout. The full
  normative texts are `APP_MANIFEST_SPEC.md`,
  `APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md`,
  `APPLICATION_DEPLOY_LAYOUT_SPEC.md`, `PACKAGING_SPEC.md`,
  `SDKWORK_DEPLOY_SPEC.md` and `ENVIRONMENT_SPEC.md`, plus
  `APPLICATION_FACTORY_DEPLOYMENT_SPEC.md`, `DEPLOYMENT_SPEC.md` and
  `RELEASE_SPEC.md` for the lifecycle; read them only when `scripts/standards.mjs`
  reports a `checkout`, and never treat the bundled contract as redefining them.
  The reviewed revision is pinned in `references/standards.lock.json`.
- **Use the app's existing login.** Publishing reuses the IAM session the app is
  already signed in to and the configured SDKWork gateway. Never request
  credentials, never create a second login or token path, never print a token.
  Signed out means: ask the user to sign in through the app's own sign-in
  surface, then retry.
- Publish only what the project's build produced. Do not run a second build with
  different configuration to make the upload pass.
- Versions are immutable: a changed build gets a new version, never the same one
  re-uploaded. Never rebuild during a retry of the same release.
- A deployment target is a claim about where the app runs. Do not invent a
  type, target, environment or hostname the manifest and platform do not
  describe.
- Keep the user's production approval: a production publish is a public action.
- Trust the reported result. A failed stage is the truth of that attempt; a
  missing deployment id means nothing was deployed.
- If this app build has no `sdkwork_deploy_app` (an older installed build), say
  so and point at the in-app publish entry; do not call the deploy API directly.

## Verification

- `node scripts/selfcheck.mjs --strict` exits 0: every reference and script the
  entrypoint names is present.
- `node scripts/standards.mjs --check` reports `checkout` or `bundled` (never
  `none`) - the workflow does not require a `sdkwork-specs` checkout.
- `node scripts/preflight.mjs <project>` exits 0 with `identity.cardId`,
  `build.outputDir` and `build.commands` reported.
- The build output directory exists and its content is the release build.
- `sdkwork_deploy_app` returns `ok: true` with a deployment id whose status was
  read back, a release id and semantic version, the environment, the domain
  (canonical or platform-default), and the previous deployment id.
- The conversation shows the published-site card with the cover image and the
  domain, and selecting it opens the site panel with the application, hostnames,
  releases and deployments.

## Output

Report, in the user's language:

- the application name and id, and whether it was resolved or created;
- the tier, artifact form, version and release id;
- the deployment id, its kind/target, and the status read back;
- the public URL, or why no hostname is assigned yet;
- the previous deployment id as the rollback reference;
- whether the source was recorded, and the account that published;
- the stopping stage and message when the publish failed.
