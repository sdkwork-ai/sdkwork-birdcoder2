# Agent Note: Make SDKWork Plugins the plugin-market authority

Status: implemented

English | [中文](2026-11-24-sdkwork-plugins-marketplace.zh.md)

## Problem

The plugin page needs a catalog whose records, categories, featured placement, artwork, capability disclosures, and install targets are owned by SDKWork Plugins. An embedded market plugin maintained a second catalog and a separate install presentation outside that data model, and the fork's first port presented a catalog record as something to "connect" rather than a package to install into the local profile.

## Decision

SDKWork Plugins owns the plugin marketplace data in its PostgreSQL module. One catalog record carries its registry identity (`catalog_provider` + `catalog_url`), localized copy, owner, package and repository facts, the popularity window it was captured from, deprecation, media rows, capability and red-line rows, and one or more ranked install targets with exactly one default. `marketplace_metadata_json` keeps the registry projection for forward compatibility, and the registry's display-only `install` text is never used as a target.

`ai_plugin_install_target.target_spec` is the string the Harness plugin manager already accepts: `<package>@<version>`, `archive+<url>`, or `git+<url>.git#<ref>&path:/<directory>`. The importer derives those targets from the registry entry exactly as dsh-market does (registry package first, then the curated release archive when it belongs to the entry's repository, then the repository path), so every one of the 12,961 published entries has an install target. PostgreSQL migration `0005_plugin_catalog_completeness` upgrades existing databases; the consolidated baseline carries the same end state.

The SDKWork Plugins PC marketplace page owns the marketplace view. It renders one record per card with its real install state, an install action, an update action when the Host can update a registry package toward the catalog version, an uninstall action for the installed dependency, and the reason an action is unavailable. BirdCoder imports that package into `ui-sdkwork-markets` and supplies the generated App SDK client, locale, host theme, and the Host plugin-manager connection: the catalog record's own target installs first, the server install plan covers records from an older catalog revision, and the imported projection is the last resort. Git specs are pinned to a commit while keeping the curated directory, and an unreachable GitHub API leaves the spec unpinned instead of refusing it.

The installed roster continues to reflect the Host profile, not catalog-level availability. A catalog record matches an installed dependency by its registry package name or by the Git origin the profile saved, and a newer catalog version over an installed registry package is reported as an update.

The Web composition no longer mounts or builds the `dshmarket` plugin. The Plugins tab is the entry to the SDKWork Plugins catalog, while official and installed views continue to use the Host plugin store and plugin configuration slots.

## Alternatives considered

**Keep the `dshmarket` plugin as the catalog owner.** It preserves its separate catalogue and install lifecycle, but the Plugins page would continue to read data outside the SDKWork Plugins database and maintain a second market integration.

**Rebuild the catalog and database access inside BirdCoder.** That would duplicate the SDKWork Plugins page and API client behavior in the host application, leaving the authoritative schema and UI in different repositories.

**Treat catalog availability as a user's installed state.** Catalog records are shared by their visibility scope; the Host profile owns the installed tree and remains the source for the installed roster.

**Keep deriving install targets only at request time.** A derivation the server recomputes per request is unindexed, untestable in SQL, and each client re-implements it; storing the ranked targets keeps one authority and lets the marketplace page stop guessing what is installable.

## Consequences

Catalog content and curation now follow the SDKWork Plugins database, API, and generated SDK release. Operators publish a catalog record with at least one install target; a record without one stays browsable but has no install action and says so. Installation, update, and removal run through the Host profile, so the marketplace can never claim an installation the Host does not hold.

The initial data now includes every published dsh-market entry (12,961), all 23 taxonomy labels in both active locales, 21,806 install targets, 11,570 media rows, and 39,906 capability disclosures. The catalog seed is transactional, idempotent, and applies to PostgreSQL 16; its identity is derived from the catalog URL so a re-import keeps each entry's id, uuid, and plugin key.

Removing `dshmarket` eliminates its submodule, workspace package closure, host build step, and `market` control contract. A future standalone SDKWork Plugins PC application can consume the same page package, while BirdCoder remains its current PC host integration.

## Verification

`sdkwork-plugins` verifies the PostgreSQL baseline and migration chain, Rust repository and API behavior, generated App and Backend SDKs, and the catalog import. The seed was applied to a PostgreSQL 16 instance: 12,961 catalog plugins, one default install target each, 11,570 media rows, 39,906 capability rows, and an unchanged row count on a second run. `tools/import_dsh_market_catalog.test.mjs` covers target precedence, stable identity across catalog order, identifier widths, and the generated locale sets.

BirdCoder verifies the marketplace page through the SDKWork Plugins App SDK, joins catalog records with the Host bundle roster (`pluginInstallation.ts`), pins Git specs without losing the curated directory, and maps Host failure codes to localized copy. The package's client specs cover the install, update, and remove paths.

The PostgreSQL integration checks in `sdkwork-plugins` still require `SDKWORK_PLUGINS_POSTGRES_URL`; continuous integration runs without a database and skips them.
