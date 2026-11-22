---
kind: upgrade-guide
description: "The packaged desktop application creates an empty ~/.birdcoder instead of renaming ~/.dsh into it, and home.adoptLegacyDshHome no longer exists."
---
# The desktop application starts on an empty brand home instead of taking over `~/.dsh`

English | [中文](guide.zh.md)

## Change

The first packaged launch used to rename an existing `~/.dsh` to `~/.birdcoder` — a same-volume move of every session, credential, profile and workspace — or create a directory link when another process still held a file. `home.adoptLegacyDshHome` in a brand manifest opted a brand into that takeover.

The launcher now resolves `~/.<home.dirName>` from `resources/brand.json`, creates it when it is missing, and exports it as `DSH_HOME`. It never reads, renames, links or writes `~/.dsh`, so an installed DeepSeek Harness and an npm `dsh` CLI keep every Session, credential and workspace they hold. A manifest that still carries `home.adoptLegacyDshHome` is accepted, and the key is ignored.

Two cases remain. An installation whose data already sits in `~/.birdcoder` continues with it. A BirdCoder build that lost the rename and kept using `~/.dsh` — the launch reported which home it kept — starts empty now: its own Sessions are still inside `~/.dsh` beside the DeepSeek Harness data, and step 2 moves them.

## Migration

1. Do nothing when `~/.birdcoder` already holds this installation's data, and when BirdCoder never ran on the machine: the next launch uses `~/.birdcoder` and leaves `~/.dsh` untouched.
2. To carry data out of `~/.dsh`, close BirdCoder and every `dsh` process first, then copy the entries you want — `sessions/`, `profiles/`, `.credentials.yaml`, and any other top-level entry you depend on — into `~/.birdcoder` and keep `~/.dsh` as it is. On macOS and Linux: `mkdir -p ~/.birdcoder && cp -a ~/.dsh/. ~/.birdcoder/`. On Windows PowerShell: `New-Item -ItemType Directory -Force "$env:USERPROFILE\.birdcoder"; Copy-Item -Recurse "$env:USERPROFILE\.dsh\*" "$env:USERPROFILE\.birdcoder"`.
3. To share one home on purpose, set `DSH_HOME` before the launch. The launcher never overrides an explicit value.
4. Delete `home.adoptLegacyDshHome` from every `brands/<key>.json` you maintain; it has no effect.
5. After upgrading, confirm the application lists the expected Sessions and remembers sign-in, and that `~/.dsh` still contains the DeepSeek Harness data it had before.
