# Agent Note: dsh release family glob excluded every depth-3 package from the bootable image

Status: implemented

## Problem

Triggered by `birdcoder-v*`, `container-release.yml`'s `container-image` job builds an offline Docker image whose `npm install /packs/dsh/*.tgz` resolves each packed tarball's declared deps at registry time. The released closure must therefore pack every harness package whose deps appear in that install set — any missing package leaves a registry lookup that 404s in the sandbox and fails the build.

The two failing CI runs on this release (run 33555133364 linux/arm64, linux/amd64) both packed exactly two dsh tarballs — `@deepseek-ai/dsh` and `@deepseek-ai/dsh-web-frontend` — and then 404'd on `@deepseek-ai/dsh-sdkwork-env-bootstrap@^0.1.2-alpha.3` when Docker ran the install. Every `packages/<group>/<pkg>/package.json` was absent from `/packs/dsh/`.

The root cause was a depth mismatch in `scripts/release/families.ts::DshFamily.versionPatterns` (and the identical `publishPatterns`). The harness packages live at **depth 3** — `packages/<group>/<pkg>/package.json` — but the pattern
```
packages/!(experimental|client/ui-sdkwork-deploy)/*/package.json
```
selects only **depth 2**, i.e. `packages/<group>/package.json`. `packages/*/` matches nothing because no group directory contains a `package.json` at that depth.

That would have been visible from a trivial dry-run check — the dsh family select every depth-3 harness, while the working-tree glob `packages/*/package.json` selects zero — but the previous "wasn't broken on Linux" assumption held. The brace-negation sub-pattern `!(experimental|client/ui-sdkwork-deploy)` is a **multi-segment alternative** returned no matches on the Windows CI hosts I was running against, which further confused the picture: locally the glob came back as zero matches altogether (not "depth-2-only"), which I initially mistook for a picomatch-on-Windows-only regression. Re-reading the pattern and counting path segments makes this just a straightforward depth bug on every platform; the host-local glob zero-match is the same bug up close.

In addition to the depth bug, the negation named only `packages/client/ui-sdkwork-deploy` — a package whose packed manifest declares four regular `@sdkwork/*` deps (`@sdkwork/deployments-app-sdk`, `@sdkwork/deployments-pc-console-publishing`, `@sdkwork/drive-app-sdk`, `@sdkwork/sdk-common`) that are internal-only and publish to no registry. But `packages/client/ui-sdkwork-share` declares the same set of regular `@sdkwork/*` deps, was never in the exclusion set, and also had to be pulled out of the closure once depth-3 packages started landing in the pack.

## Decision

Drop the brace-negation glob form for the dsh family and make `ReleaseFamily` carry an explicit exclude hook. A glob that returns zero matches is the worst kind of bug — silent until the downstream consumer reaches the missing member — so the new `excludedDirectories()`/`isExcluded()` seam lives in the production discovery path, returns a deterministic list that appears in the next CI log, and is enforced by a unit test that walks `versionMembers` and asserts no excluded path reappears.

The shapes are:

- `ReleaseFamily.excludedDirectories()` — a method returning `readonly string[]`. Defaults to `[]`; subclasses override. Each entry is either an **exact** repository-relative package directory (`packages/client/ui-sdkwork-deploy`) or a **prefix** (`packages/experimental`) — when it lacks a trailing `package.json` it excludes every nested package beneath it. The base `isExcluded(member)` checks both exact and prefix forms.
- `ReleaseFamily.discoverMembers(...)` globs the family's patterns (expanded to `packages/*/*/package.json` for depth-3 correctness), then drops every member whose directory is in `excludedDirectories()` or whose manifest returns `true` from `isExcluded()`. The exact-set short-circuits the prefix loop: `discoverMembers` builds `excludedDirectories` into a `Set` once and calls `isExcluded` only for non-exact hits.
- `DshFamily` overrides `excludedDirectories` to return `DSH_EXCLUDED_DIRECTORIES = ['packages/experimental', 'packages/client/ui-sdkwork-deploy', 'packages/client/ui-sdkwork-share']`. `packages/experimental` is private and ships through a separate sequence; the two ui-sdkwork-* packages declare regular `@sdkwork/*` deps that publish to no registry.
- `DshFamily.versionPatterns` and `publishPatterns` become `['packages/*/*/package.json', 'apps/*/package.json']` and `['packages/*/*/package.json', 'apps/cli/package.json', 'apps/web/package.json']` — both unambiguous longhand.

The two ui-sdkwork-* packages still build and test in this repository; they just do not enter the bootable image's closure. They continue to ship to npm through a separate channel.

## Alternatives considered

**Patch the brace-negation form instead of replacing it.** Rejected. `packages/!(experimental|client/ui-sdkwork-deploy)/*/package.json` is depth-2, so it would have to become `packages/!(experimental)/*/*/package.json` to fix the depth. The resulting pattern is hard to read, fails on Windows picomatch (returns 0 matches on this runtime), and silently drops members when a new SDKWork-only package adds a sibling at any depth. An explicit `excludedDirectories()` list returns a readable, testable, CI-visible list.

**Use `versionPatterns: ['packages/*/*/package.json']` and rely on `bundle/web-app/releasable.ts`-style dynamic discovery.** Rejected. This repository's release-family contract is shaped by the test harness at `scripts/release/families.spec.ts`, which walks `versionMembers(root)` and asserts directory-level facts. A purely dynamic list makes those assertions unreproducible.

**Carry the list per-member in `package.json` metadata and reject on read.** Rejected. A discovery-time `private: true`-style skip would be implicit in the manifest, duplicate the npm-publish-policy, and surface only when the member happens to be read. A method on the family keeps the intent in tests and CI logs.

**Exclude only `@sdkwork/*`-carrying manifests at discovery time.** Rejected as the sole mechanism. The `experimental` group is excluded for a separate reason (it is a private pre-release sequence), so its exclusion belongs in a name list, not a content predicate.

## Consequences

- The `dsh` family now selects 268 version members on the checked-out tree, up from 3 (`{apps/cli, apps/web, apps/desktop}`). Confirmed locally by running `releaseFamily('dsh').versionMembers(root)`. The Docker image packs those 267 publish members (`@deepseek-ai/dsh-desktop` is private) as `/packs/dsh/*.tgz` in CI.
- `scripts/release/families.spec.ts` continues to pass. The new `families.spec.ts` `excludes private experimental packages from the dsh release` and `versions the private desktop app without adding it to the npm publish set` still exercise the post-fix discovery path.
- `DshFamily` is now honest about its depth: `packages/*/*/package.json` matches `packages/<group>/<pkg>/package.json`, while `apps/*/package.json` matches `apps/<pkg>/package.json` — each side unambiguous.
- The two ui-sdkwork-* packages no longer enter the bootable image. Their published npm tarballs (from the npm publish workflow, which uses its own discovery) are unaffected; this change touches only the offline container build.

## Testing

- `vitest run scripts/release/` green: 44/44 tests pass, including the full `families.spec.ts` suite.
- `node --input-type=module` one-shot: `releaseFamily('dsh').versionMembers(root).length === 268`, `publishMembers(root).length === 267`; assert `packages/experimental/` absent, `@deepseek-ai/dsh-client-ui-sdkwork-{deploy,share}` absent, `@deepseek-ai/dsh-sdkwork-env-bootstrap` present (previously 404'd), `dsh-desktop` in version set but not in publish set, `verifyVersions` passes (single version).
- The container-image CI job still needs a re-run to confirm the fix end-to-end on linux/amd64 and linux/arm64.
