# Agent Note: Brand home starts empty and never touches `~/.dsh`

Status: implemented

English | [中文](2026-11-23-brand-home-fresh-start.zh.md)

## Problem

The packaged desktop application adopted a first-launch user's data by renaming `~/.dsh` to `~/.birdcoder`, or by creating a directory link between the two when a rename was refused. Both operations hand DeepSeek Harness's home to another product: after the rename, an installed upstream application and the npm `dsh` CLI resolve `~/.dsh` to nothing and start over; after the link, they write into the brand home and read BirdCoder's Sessions under their own name. A refused rename that kept using `~/.dsh` mixed both products in one directory, which is the state the application reported and then lived with. Installing a second product must not move, hide, or write another product's data, whatever continuity adoption offered existing users.

## Decision

`apps/desktop/src/brand.ts` resolves `~/.<home.dirName>` from `resources/brand.json`, creates it when it is absent, and exports it as `DSH_HOME`; an explicit `DSH_HOME` still wins untouched. Adoption is gone: the launcher never reads, renames, links or writes `~/.dsh`, so a brand home starts empty and holds only what this brand creates. `home.adoptLegacyDshHome` is removed from the manifest schema; a manifest that still carries the key parses, and the key has no effect. The npm `dsh` CLI keeps resolving `~/.dsh` through `@deepseek-ai/dsh-home-paths`, so an installed Harness and this brand own disjoint homes.

This supersedes the adoption mechanism of [OEM brands own their home and application identity](2026-10-29-oem-brand-home-and-identity.md); the manifest ownership of brand identity and the `DSH_HOME` seam it established still ship. The user-facing delta is recorded in [the upgrade guide](../../../../docs/upgrade-guide/v0.2.3-alpha.2/brand-home-fresh-start/guide.md).

## Alternatives considered

**Copy `~/.dsh` into a fresh brand home.** Rejected: those credentials, Sessions and workspaces belong to another product's home. Duplicating them imports its sign-in state, doubles attachment storage, and leaves two divergent copies of one history. A user who wants continuity copies the entries into `~/.birdcoder` deliberately, as the upgrade guide instructs.

**Keep the rename and report it better.** Rejected: the rename is the damage — it leaves the other product's home nonexistent from its own point of view, and no message repairs that.

**Keep adoption behind the manifest flag for a brand that replaces an installation.** Rejected: the flag records which identity the packager intended, not who owns `~/.dsh` on the machine at launch time. A brand cannot know whether the file's current owner is still installed, so configuration cannot make the takeover safe.

**Link instead of rename so both names stay valid.** Rejected: a link makes two products write one directory, so each one's Sessions and credentials appear under the other's name.

## Consequences

A first launch after upgrading starts on an empty home: the user signs in again, and Sessions written under `~/.dsh` are not in the brand's list. An installation whose data already sits in `~/.birdcoder` continues normally. BirdCoder builds that lost earlier renames left their data inside `~/.dsh`, which the upgrade guide migrates by copy.

DeepSeek Harness data now survives every BirdCoder launch, update and uninstall, and both products can run side by side on one profile of the operating system without either one resolving the other's home. `apps/desktop/tests/brand-home.spec.ts` pins the four outcomes: an explicit `DSH_HOME` is kept, a missing brand home is created empty while an existing `~/.dsh` keeps its contents, an existing brand home is reused untouched, and a failed creation is reported while the launch still exports the brand home.
