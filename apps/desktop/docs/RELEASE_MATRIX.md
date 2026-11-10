# BirdCoder release matrix and download catalog

One row per packaged target. The download catalog seeds in
`sdkwork-deployments/database/seeds/common` reference the published names and
URLs below, so packaging a target and running `publish:release` is the whole
loop: no console typing and no seed edits.

## Targets

| Target | Package command (`apps/desktop`) | electron-builder artifact | Published name | Feed file |
| --- | --- | --- | --- | --- |
| `win-x64` | `pnpm run package:win:x64` | `BirdCoder-<v>-win-x64.exe` | `BirdCoder-win-x64.exe` | `feeds/win-x64/nightly.yml` |
| `win-arm64` | `pnpm run package:win:arm64:unsigned` (signed: see below) | `BirdCoder-<v>-win-arm64.exe` | `BirdCoder-win-arm64.exe` | `feeds/win-arm64/nightly.yml` |
| `mac-arm64` | `pnpm run package:mac:arm64` | `BirdCoder-<v>-mac-arm64.dmg` | `BirdCoder-mac-arm64.dmg` | `feeds/mac-arm64/nightly-mac.yml` |
| `mac-x64` | `pnpm run package:mac:x64` | `BirdCoder-<v>-mac-x64.dmg` | `BirdCoder-mac-x64.dmg` | `feeds/mac-x64/nightly-mac.yml` |
| `linux-x64` | `pnpm run package:linux:x64:unsigned` | `BirdCoder-<v>-linux-x64.AppImage` | `BirdCoder-linux-x64.AppImage` | `feeds/linux-x64/nightly.yml` |
| `linux-arm64` | `pnpm run package:linux:arm64:unsigned` | `BirdCoder-<v>-linux-arm64.AppImage` | `BirdCoder-linux-arm64.AppImage` | `feeds/linux-arm64/nightly.yml` |

`<v>` is the `apps/desktop/package.json` version. The `win-*` and `linux-*`
builds need their native toolchains (Windows VS Build Tools; Linux `musl-tools`,
`rpm`, `xz`), and macOS builds need a macOS host. A signed Windows ARM64 or macOS
lane runs `pnpm run package -- <target>` with the signing environment configured
(see `packaging/README.md` and `windows-signing/README.md`).

## Publishing one target

```bash
# electron-builder output: dist/ (or your --config output dir)
pnpm --dir apps/desktop run publish:release -- \
  --target win-x64 \
  --input dist \
  --out release/win-x64 \
  --channel nightly \
  --base-url https://www.modelscope.cn/datasets/sdkwork/birdcoder/resolve/master
```

The script (`apps/desktop/scripts/publish-release-artifacts.mjs`):

1. copies `BirdCoder-<v>-<os>-<arch>.<ext>` to `BirdCoder-<os>-<arch>.<ext>`
   (plus `.blockmap` when present);
2. rewrites the updater metadata so `files[].url` and `path` point at that
   version-free URL;
3. writes `feeds/<target>/<channel>.yml` (mac: `<channel>-mac.yml`).

Upload `release/<target>/BirdCoder-<os>-<arch>.<ext>` and the `feeds/` directory
to the same dataset path the seeds use. The ModelScope upload itself is not
automated here: it needs dataset credentials that are not part of this
repository.

## Dataset layout expected by the seeds

```
BirdCoder-win-x64.exe
BirdCoder-win-arm64.exe
BirdCoder-mac-arm64.dmg
BirdCoder-mac-x64.dmg
BirdCoder-linux-x64.AppImage
BirdCoder-linux-arm64.AppImage
feeds/win-x64/nightly.yml
feeds/win-arm64/nightly.yml
feeds/mac-arm64/nightly-mac.yml
feeds/mac-x64/nightly-mac.yml
feeds/linux-x64/nightly.yml
feeds/linux-arm64/nightly.yml
```

Catalog download links use the raw URL with `?view=false`
(`https://www.modelscope.cn/datasets/sdkwork/birdcoder/resolve/master/BirdCoder-win-x64.exe?view=false`).
Feed documents are uploaded without the query so electron-updater can derive the
blockmap URL.

## Update feeds are seeded paused

`deploy_download_update.enabled` is `FALSE` in the seeds: an enabled feed whose
channel document has not been uploaded turns every check into a visible failure.
After uploading a feed, enable it in the Deploy console
(`/admin/downloads/downloadCatalog`) by switching the provider to
`deployments`/`generic`, setting the feed directory, and enabling the row.

## Seed profiles

| Environment (`etc/topology/*.env`) | Seed profile | Channel | Version | Check interval | Rollout |
| --- | --- | --- | --- | --- | --- |
| `*.test` | `test` | nightly | `0.2.2-rc.1` | 10 min | 100% |
| `*.development` | `development` | nightly | `0.2.2-rc.1` | 5 min | 100% |
| `*.staging` | `staging` | stable | `0.2.2` | 10 min | 100% |
| `*.production` | `production` | stable | `0.2.2` | 30 min | 20% |
| `*.demo` | `standard` | stable | `0.2.2` | 30 min | 20% |

`minimal` seeds nothing (schema only). Profiles are selected through
`SDKWORK_DATABASE_SEED_PROFILE`, which each topology env file already sets; the
database manifest default stays `standard`.
