# Agent Note: The plugin market ships by default

Status: implemented

English | [中文](2026-11-02-plugin-market-ships-by-default.zh.md)

The market's data and page ownership are defined in [Make SDKWork Plugins the plugin-market authority](../architecture/2026-11-24-sdkwork-plugins-marketplace.md).

## Problem

The Plugins tab is the product's entry to installable plugins. Leaving that location as an installer prompt makes a catalog capability depend on an optional plugin package and gives the product no clear owner for the catalog users browse.

## Decision

Every shipped Web and desktop composition opens the Plugins tab on the SDKWork Plugins marketplace page without a separate market installation. The page package is owned by `sdkwork-plugins` and is integrated by BirdCoder's `ui-sdkwork-markets` package. Its directory reads categories and plugin records through the generated SDKWork Plugins App SDK; the SDKWork Plugins PostgreSQL module is the data authority.

The database stores localized category and plugin text, icons, usage counts, featured placement and copy, and optional Git or Drive artifact sources. A catalog record without a source remains discoverable but has no connection action. A source-backed record enters the Host's existing inspection, approval, and profile installation flow. The installed view reads the Host profile and is not inferred from catalog availability.

The old `dshmarket` plugin and its `market` service are not part of the Web composition. The marketplace package contains its own page and catalog service, while BirdCoder supplies the SDK client, shared locale, navigation, and Host install callback. The complete data and source mapping contract is recorded in the [architecture note](../architecture/2026-11-24-sdkwork-plugins-marketplace.md).

## Consequences

Operators curate one catalog in SDKWork Plugins through its backend API. Existing records in that database gain localized metadata and usage values through the additive PostgreSQL migration; records that existed only in a separate dshmarket deployment are not imported. The catalog's `installStatus` describes the shared record and does not represent a particular user's installed plugin tree.

The Plugins tab remains available to both Web and desktop profiles because it is owned by the shipped UI package, not by an optional market bundle. The Host plugin store continues to own installed, official, and plugin-configuration views.

## Verification

SDKWork Plugins checks the database baseline and migration, Rust persistence and App/Backend API contracts, and generated TypeScript SDKs. Its live PostgreSQL migration check requires `SDKWORK_PLUGINS_POSTGRES_URL`.

BirdCoder checks that the Web composition contains `ui-sdkwork-markets` and no longer contains `dshmarket`, and that the marketplace uses the generated App SDK and Host plugin-manager installation flow.

## Alternatives considered

**Leave the Plugins tab install-on-demand.** It avoids shipping catalog UI to deployments that do not use plugins, but the product's plugin entry would remain an installer prompt instead of a browseable catalog.

**Keep `dshmarket` as a required package.** It supplies a complete market UI and install experience, but stores catalog records outside the SDKWork Plugins database and requires a separate contract and runtime integration.

**Select a market bundle in each profile.** This ties the catalog to user profile data and misses existing initialized homes unless an upgrade edits those profiles. A shipped UI page keeps catalog availability in the application composition.

**Use a cloud storefront catalog for plugins.** The App Store's plugin shelf is not the SDKWork Plugins registry and has no authority over this database's catalog records or artifact sources.
