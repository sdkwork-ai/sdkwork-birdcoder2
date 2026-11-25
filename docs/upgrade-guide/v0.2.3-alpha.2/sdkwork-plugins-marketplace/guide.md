---
kind: upgrade-guide
description: "The Plugins catalog moves from dshmarket to the SDKWork Plugins database and API."
---

# The Plugins catalog uses SDKWork Plugins

English | [中文](guide.zh.md)

## Change

The Plugins tab now reads categories and plugin records from the SDKWork Plugins App API. The `dshmarket` plugin, its `market` control service, and its Web-composition row are removed. Existing catalog data held only by a separate dshmarket deployment is not copied into the SDKWork Plugins database. Each catalog record carries one or more install targets ranked by preference (`registry` package, release archive, repository path); a record without one remains visible but has no Install action and states why.

## Migration

1. Remove any custom `dshmarket` dependency and `dsh-market` composition row from profile or bundle configuration. The built-in Plugins page now supplies the catalog.
2. Apply the SDKWork Plugins database migrations from that repository with `pnpm db:migrate`, then run the standard seed profile. It loads the published dsh-market catalog with its install targets, media, and capability disclosures; the importer records the source revision and checksums so a later refresh is reproducible.
3. Sign in to the upgraded application and confirm the catalog loads from the configured SDKWork API. Confirm a catalog record installs into the local profile through the Host plugin manager, an installed record shows its installed version (and an update when the catalog publishes a newer registry version), and a record without an install target has no active Install action.

There is no SDKWork-side install endpoint or permission to configure: the catalog publishes the target, and the client's Host profile performs the installation, update, and removal.
