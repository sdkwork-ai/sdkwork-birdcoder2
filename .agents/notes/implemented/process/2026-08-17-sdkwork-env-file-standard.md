# Agent Note: SDKWork env-file standard materializes the root .env

Status: implemented

English | [中文](2026-08-17-sdkwork-env-file-standard.zh.md)

## Problem

The repository had no env-file configuration at all: the boot loader reads a gitignored `.env` from the invoking directory and the Harness home ([`loadLayeredEnv`](../../../../packages/boot/app-boot/src/index.ts)), the docs told contributors to put keys there, but no checked-in template, no ignore rules for overlay files, and no identity declaration existed. sdkwork-specs `ENVIRONMENT_SPEC.md` defines the canonical env-file standard — two-segment profile ids (`<deploymentProfile>.<environment>`), self-declared identity keys, tracked templates with placeholder values, and gitignored local overlays — and this repository, an SDKWork product root, did not follow it.

## Decision

The repository now materializes the standalone profile matrix per the standard — the development default plus test and production templates — with the existing loader as the fixed `.env` consumer:

- **`.env.example`** at the repo root is the checked-in template for the canonical profile `standalone.development`: the generic and `SDKWORK_BIRDCODER_*` identity keys (`SDKWORK_ENVIRONMENT`, `SDKWORK_DEPLOYMENT_PROFILE`, `SDKWORK_PROFILE_ID`, `SDKWORK_RUNTIME_TARGET`, and the application-scoped equivalents), the `SDKWORK_ACCESS_TOKEN` bootstrap credential placeholder (ENVIRONMENT_SPEC §6.1), the product provider keys (`DEEPSEEK_API_KEY`, `EXA_API_KEY`, `PERPLEXITY_API_KEY`, `E2B_API_KEY`, `SDKWORK_API_KEY`, `BIRDCODER_API_KEY`), and a comment-only list of launch-environment variables the loader rejects from `.env` files.
- **`.env.standalone.test.example`** and **`.env.standalone.production.example`** at the repo root extend the same template to the test and production tiers, following the Node-server materialization row of §5.1.3 (`.env.<profile-id>.example`). The identity values differ (`SDKWORK_ENVIRONMENT`, `SDKWORK_PROFILE_ID`, and the `SDKWORK_BIRDCODER_*` equivalents); the credential placeholders, the provider-key block, and the ambient-only comment list mirror `.env.example`, whose header points at both files. No gitignore change was needed: the overlay rules already cover the new profiles' local files.
- **`.gitignore`** ignores the standard's overlay files (`.env.local`, `.env.*.local`, `.env.*.bootstrap.local`) beside the existing `.env`.
- **Docs** (AGENTS.md, docs/development.md, INSTALL.md, with their Chinese counterparts) name the template, the profile-id convention, and the loader's bootstrap-name rejection. The AGENTS.md word-budget ceiling rises from 1900 to 1950 in [scripts/doc-budgets.manifest.json](../../../../scripts/doc-budgets.manifest.json): the file sat exactly at its ceiling, and the env-file convention must stay visible in the contributor contract (AGENTS.md's own editing rule sanctions a raise when the required content genuinely needs more space).

The identity keys are no longer self-declaration only: the ui-sdkwork-env host registration projects the launch environment (profile id, surface URLs, `SDKWORK_ACCESS_TOKEN`) into the settings composition `base` layer, and the startup ensure step generates bootstrap tokens into the gitignored profile overlays ([env bootstrap and projection](../feature/2026-08-18-sdkwork-env-bootstrap-token-and-projection.md)). The web renderer's SDKWork endpoints keep coming from the settings-driven `ui-sdkwork-env` profile ([shared deployment environments](../feature/2026-08-17-shared-deployment-environments.md)), now defaulting from the env files.

## Alternatives considered

**Profile-aware env loading (`loadEnv` reading `.env.<profile-id>`).** The loader would select `.env.cloud.production` and friends by profile; but the loader already implements the standard's layered model (project `.env` + Harness-home `.env`, inherited environment wins), nothing consumes profile-suffixed files, and the repo's existing `--profile` flag selects cordis compositions, not deployment environments — the change would add machinery with no consumer.

**`etc/sdkwork.deployment.config.json` and `etc/topology/*.env` source-authority layer.** Sibling repositories declare their standalone/cloud profile matrix there; this repository has no deployment-profile matrix machinery or consumer, so the declaration would be inert and risk claiming support the repo does not honor.

**`.env.postgres.example`.** The standard requires it for repositories using the unified workspace PostgreSQL profile; this repository has no PostgreSQL (session persistence is client-local SQLite not driven by env), so the file would be noise.

## Consequences

Contributors and operators now have three checked-in templates (development, test, production) documenting every env var the product reads, with placeholders only, and the standard's overlay ignore rules are in place for when profile-suffixed loading arrives. Costs: the identity keys stay inert in a pure harness run without SDKWork identity keys, and the template documents the loader's ambient-only names in comments rather than as assignable lines, so a naive copy never trips the loader's rejection.

## Testing

The note-format and translation-pairing gates verify the note triplet; `git diff --check` keeps whitespace clean. No code changed, so no unit or snapshot coverage applies; CI's doc gates own the full verification.
