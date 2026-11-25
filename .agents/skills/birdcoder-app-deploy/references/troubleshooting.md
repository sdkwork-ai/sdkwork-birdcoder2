# Publish troubleshooting

Read this after a publish reports `ok: false`. Fix the named stage, then call
the tool once more; do not retry the same inputs.

## Tool-level failures

| Code / stage | Cause | Fix |
|---|---|---|
| `NO_CLIENT` | no connected browser client can answer the publish (headless Session) | open the Session in the BirdCoder app and retry |
| `SIGNED_OUT` (`signedOut`) | this app has no IAM session | sign in with the app's own sign-in surface, then retry |
| `NO_PROJECT` | no directory given and the Session has no working directory | pass `directory` |
| `NO_MANIFEST` | no `agent.app.config.json` under the directory | publish only an SDKWork app project, or create the manifest first |
| `APP_TYPE_AMBIGUOUS` | the manifest does not resolve to one type | name the app type in `app`/`runtime` per the manifest spec |
| `BUILD_OUTPUT_MISSING` | no conventional output and no `buildOutput` | run the project's build, or pass `buildOutput` |
| `INVALID_VERSION` | the requested version is not semantic | use `major.minor.patch` or omit it |
| `CANCELLED` | the caller cancelled the turn | re-run when the work is ready |

## Platform-stage failures

Stage names mirror the publisher: `resolveApp`, `createApp`, `pack`,
`uploadArchive`, `registerArtifact`, `createRelease`, `createDeployment`,
`readSite`.

- **`pack`** — the Host could not read the output, the archive was empty, or it
  exceeded the package-type ceiling. Check the output directory and its size;
  exclude local secrets (the packer already drops `.env` and key material).
- **`uploadArchive` / `registerArtifact`** — the Drive upload or artifact
  registration failed. Usually a stale size or checksum after the output
  changed mid-run; rebuild and publish again with a fresh version.
- **`createRelease`** — the version is taken, the target belongs to another
  app, or the package is not an artifact this target accepts. The executor bumps
  a taken version automatically; a rejected target means the override is wrong.
- **`createDeployment`** — the kind/target pair is not accepted for the
  environment, or the release is not deployable. Read the server message and
  choose the pair from `deployment-targets.md`.
- **`readSite`** — the publish landed but the read-back failed. Do not republish
  to "fix" it: report the release id and re-read from the site panel.
- **`LINKAGE_WRITE_FAILED`** — the app exists but the project manifest could not
  be updated. Retry the same publish; creation is refused a second time.

## Source recording

`sourceRecorded: false` means the artifact published but the source update was
refused (for example the artifact is not attributed to the app). The deployment
is still valid; record the Git source in the console if the project needs a
source.

## When the tool is not in this app build

An older BirdCoder build has no `sdkwork_deploy_app`. In that case the
conversation cannot run the publish: report that the in-app publish entry (the
rocket in the conversation header) owns publishing in this build and stop. Do
not call the deploy API directly, and do not invent a credential path.

## When the standards checkout is absent

The skill is portable: `references/standards/` carries the distilled contract,
so the workflow never needs a `sdkwork-specs` checkout. Run
`node scripts/standards.mjs --check` when you need to know which source is in
use: `checkout` means the full normative text is available, `bundled` means the
distilled contract is authoritative, `none` means the installation is
incomplete. A missing checkout is not a reason to stop a publish.

## When the package is incomplete

If a link under `references/` or `scripts/` cannot be read, the skill was
installed as `SKILL.md` alone. Run `node scripts/selfcheck.mjs --strict` (from
the skill directory) to list the missing files, then reinstall the whole
directory. Do not reconstruct a missing reference from memory.
