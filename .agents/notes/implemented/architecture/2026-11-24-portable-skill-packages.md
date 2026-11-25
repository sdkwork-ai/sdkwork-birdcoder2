# Agent Note: Portable skill packages

Status: implemented

English | [中文](2026-11-24-portable-skill-packages.zh.md)

## Problem

A skill that a user or another agent installs is a directory package, not a
repository checkout. The deploy skill cited six `sdkwork-specs` documents by name
and assumed a sibling checkout, so a machine without the checkout could not
resolve the normative text. Shipping skills also have a second failure: many
installers copy only `SKILL.md`, leaving `references/` and `scripts/` behind with
no warning. Repository-bound skills (`.agents/skills`, the preset's developer
skills) legitimately cite the checkout, but nothing distinguished them from
product skills, so an installer could treat them as portable and break them.

## Decision

- **Product skills are self-contained.** `birdcoder-app-deploy` ships six
  distilled contracts under `references/standards/` (manifest v3, client
  architecture alignment, packaging, host deploy, environments, deploy layout).
  The entrypoint names the full normative texts only as authority; the bundled
  contract is the operational source.
- **The reviewed standards are pinned.**
  `references/standards.lock.json` records the `sdkwork-specs` revision and the
  SHA-256 of the nine cited specs, plus the hashes of the six bundled contracts.
  `scripts/gen-skill-package.ts` writes the lock and `skill.manifest.json`;
  `--check` fails on drift.
- **A checkout is optional.** `scripts/standards.mjs` resolves, in order:
  `SDKWORK_SPECS_HOME`, `sdkwork-specs` beside any of the skill's ancestors, the
  bundled contracts, then none. The preflight runs the official manifest checker
  only when a checkout is reachable; otherwise the bundled contract validates the
  project and the publish proceeds.
- **Installations are provable.** `skill.manifest.json` lists every packaged file
  with its SHA-256 and the required `references/`/`scripts/` entries.
  `scripts/selfcheck.mjs --strict` reports a single-file installation and names
  the missing files.
- **The package can be distributed and installed safely.**
  `scripts/pack-skill.ts` verifies the manifest, then writes a deterministic ZIP
  (`dist/skill-packages/<name>-<version>.zip`), its `.sha256`, and a descriptor
  with the file list and checksum. `scripts/install-skill.ts` installs a
  directory or that ZIP into a skills root: it verifies hashes before and after
  staging, rejects `..`/absolute archive entries and unlisted files, and replaces
  an existing same-named skill only with `--force`.
- **Product and repository scopes are explicit at the gate.**
  `scripts/verify-skill-portability.ts` treats the builtin catalog as product
  (no parent paths, absolute paths, `sdkwork-specs` links or commands, and a
  manifest whenever assets ship) and `.agents/skills` plus the preset as
  repository (citations allowed, dead links reported as warnings). A repository
  mirror of a product skill keeps the product rules, so the authoring mirror does
  not become a second scope.
- **The portability rules travel with the gate.** `pnpm run
  verify-skill-portability` and `pnpm run verify-skill-package` join the quick
  gates; the skill's own tests cover resolution, preflight fallback and
  completeness.

## Alternatives considered

- **Require a `sdkwork-specs` checkout on every machine.** Rejected: that is the
  reported failure. It also makes a second repository a prerequisite for using a
  skill.
- **Copy the six specs verbatim into the skill.** Rejected: the package grows,
  the prose is not written for an agent workflow, and the copies drift. The
  distilled contract states the decisions and fields the workflow needs, and the
  lock makes divergence reviewable.
- **Fetch the specs from a URL at runtime.** Rejected: the publish must work
  offline, and untrusted remote text is a supply-chain and prompt-injection
  risk.
- **Let installers copy only `SKILL.md` and degrade silently.** Rejected: the
  workflow then references files no machine has. The manifest and selfcheck turn
  that into a named, actionable failure.
- **Rewrite every repository skill to be portable.** Rejected: `.agents/skills`
  documents this checkout and is not product content. Marking the scope at the
  gate is the honest boundary; only product skills must be self-contained.

## Consequences

- Updating `sdkwork-specs` requires reviewing the affected distilled contract and
  re-running `pnpm run gen-skill-package`; the gate fails until the lock is
  refreshed. The distilled text can lag the spec, which is why the lock names the
  reviewed revision and the resolver prefers a checkout when one exists.
- The deploy skill carries six extra contracts (~35 KB total), and the
  package-extra files must travel together. Installers that copy only
  `SKILL.md` now fail selfcheck instead of failing later.
- Repository skills can still have dead links to placeholder templates; the gate
  reports them as warnings rather than blocking unrelated work.
- The card for a published site uses the manifest's cover (preview, else
  screenshot, else icon) rather than capturing the live page; a live screenshot
  is deferred because it needs a browser capture path in the client.

## Verification

- `pnpm run verify-skill-portability` — zero errors across the three skill roots.
- `pnpm run verify-skill-package` — lock and manifest current.
- `pnpm exec vitest run packages/skill/sdkwork-builtin-skills scripts/verify-skill-portability.spec.ts scripts/skill-package.spec.ts` — preflight, resolver, selfcheck, gate and distribution tests.
- `pnpm run pack-skill` then `pnpm exec tsx scripts/install-skill.ts --from
  dist/skill-packages/<name>-<version>.zip --to <skills-root>` installs a
  verified package; the installed directory passes `selfcheck --strict`.
- Copy the skill and a fixture project to `%TEMP%` with `SDKWORK_SPECS_HOME`
  pointing nowhere: `standards.mjs --check` reports `bundled`, `selfcheck
  --strict` reports complete, and `preflight.mjs` reports `ok: true`.
