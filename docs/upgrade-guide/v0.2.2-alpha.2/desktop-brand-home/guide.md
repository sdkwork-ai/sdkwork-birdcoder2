---
kind: upgrade-guide
description: "Each application brand owns its own Harness home; BirdCoder moves ~/.dsh to ~/.birdcoder on the first packaged launch, and an explicit DSH_HOME still wins."
---
# Each application brand owns its own Harness home

English | [中文](guide.zh.md)

## Change

The desktop application resolves its data root from the brand manifest shipped as `resources/brand.json`: the shipped `brands/birdcoder.json` names `~/.birdcoder`. The launcher exports that directory as `DSH_HOME` before any plugin mounts, so profiles, sessions, credentials, attachments, workspaces, and the OEM profile file all move together. `~/.dsh` is no longer shared with the desktop application.

The first packaged launch takes over an existing `~/.dsh`: it renames the directory (a same-volume move that carries every session, credential, profile and workspace), falls back to a directory link when a rename is refused because another instance still holds a file, and otherwise keeps using `~/.dsh` for that launch and reports it. A brand manifest that does not set `home.adoptLegacyDshHome` never reads `~/.dsh`.

The installed CLI launcher defaults `DSH_HOME` to the same brand home, so a terminal run and a window run read one set of sessions; an explicit `DSH_HOME` still wins in both.

Every identity two installed brands must not share now comes from the same manifest: product name (userData, single-instance lock, logs), URL scheme, desktop command and its ownership receipt, Windows PATH-ownership key and mutex, updater cache directory, and artifact spelling. Selecting `DSH_BRAND=<key>` at packaging time produces a shell that installs, runs, updates and uninstalls beside the shipped one.

The npm `dsh` CLI is unchanged: it still reads `$DSH_HOME` and otherwise defaults to `~/.dsh`, because an upstream installation shares that directory.

## Migration

1. Desktop users have nothing to do: the next packaged launch moves `~/.dsh` into `~/.birdcoder`. Start the application once and confirm the data arrives instead of starting a session through an older build afterwards.
2. To share one home on purpose — for example the desktop application and an npm `dsh` against the same sessions — set `DSH_HOME` explicitly. The launcher never overrides an explicit value, and no identity is moved in that case.
3. To keep `~/.dsh` untouched — for example because an upstream `dsh` still writes there — set `DSH_HOME` to a dedicated directory for the desktop application before the first launch of this version. The legacy move is skipped whenever `DSH_HOME` is set.
4. After upgrading, confirm continuity: `~/.birdcoder` holds `sessions/`, `profiles/desktop/`, and `.credentials.yaml`; `~/.dsh` is either gone or a link to it. Sign-in state and stored API keys travel with the move.
5. OEM packagers select `DSH_BRAND=<key>` for every packaging step, ship `resources/brand.json`, and set `home.adoptLegacyDshHome` only for a brand that replaces an existing `~/.dsh` installation. See [brands/README.md](../../../../brands/README.md) for the full field list, the identity values a new brand must change, and the build-time rasters it must replace.
