# PACKAGING_SPEC — bundled contract

Authority: `sdkwork-specs/PACKAGING_SPEC.md`. Distilled for portability; the
checkout text wins when available.

## What this spec owns

Artifact **content** only: which files enter a package, how the content manifest
is produced, and which files are forbidden. Package identity, formats, ids,
naming, evidence, signing and publication belong to `APP_MANIFEST_SPEC.md` §10,
`NAMING_SPEC.md`, `RELEASE_SPEC.md` and `SUPPLY_CHAIN_SECURITY_SPEC.md`.

## Rules

- A packaging plan is declarative: every included entry names its archive path,
  source path, mode and required flag. Nothing is included by a glob that the
  plan does not name.
- The file set is deterministic and recorded in a content manifest (path, size,
  hash) together with package id, version, target and runtime target. That
  manifest is release evidence.
- Forbidden in every format and every view (plain, archive, mounted):
  build/tooling state, dependency directories, VCS/CI metadata, secrets and any
  `.env*`, development endpoints or credentials, tests, debug symbols and
  unstripped binaries.
- Container images: stage the tree or ship a complete `.dockerignore`, never
  `COPY` the repository root, use BuildKit secrets, build multi-stage.
- Required in a deliverable: stripped executables with mode, a generated config
  template with no secrets, the runtime directory layout, the installer or
  entrypoint, `install-manifest.json`, format metadata and signed checksums.
- Install target matrix: `/usr/lib|/usr/share|/etc|/var/lib|/var/log|/var/cache|/run/sdkwork/<application-code>`;
  Windows `%ProgramData%`; macOS `/Library/Application Support`. Archives
  install under `/opt/sdkwork/<application-code>`.
- Layer sizes are recorded; an unusually large layer is justified in the
  release evidence.

## What this spec does not define

Per-file size limits, the package-type vocabulary and package naming. The deploy
platform's artifact form (`static`, `native`, `mini-program`, `server-bundle`,
`generic`) is its own registration table, not this spec's package matrix.

## Gate

`sdkwork-specs/tools/check-package-content-standard.mjs` blocks a release whose
content violates these rules.
