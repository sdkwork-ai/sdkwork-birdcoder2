# Agent Note: Plugin sources behind the create and install flows

Status: implemented

English | [中文](2026-11-12-plugin-sources-create-and-install.zh.md)

## Problem

The Plugins cloud catalog listed entries that could not be installed. Each card carried display metadata and a server-side enable flag, but nothing said where the plugin package lived, so the list's action toggled a record instead of installing code. Real plugins come from three places: an archive (a zip or tar of the package), a Git repository — often one directory of a repository that publishes several plugins — and a sdkwork-drive directory. The create and install flows had the same gap: creation dispatched a prompt that guessed both the package and its location, and installation only knew pnpm's registry, Git, tarball, and local-path specs.

The request was to make the list and both flows source-aware while keeping one plugin standard: a bundle package with `dsh.bundle` and a `cordis.patch.yml`, installed through the plugin manager's existing pipeline.

## Decision

A plugin source is a first-class description with three forms, and every surface uses it:

- `git` — an https repository URL, an optional ref, and an optional plugin directory. One repository may publish several plugins; the directory distinguishes them.
- `archive` — an http(s) zip or tar archive, an optional directory inside it, and an optional SHA-256.
- `drive` — a sdkwork-drive directory, resolved by the credential holder to the https download package the Drive API hands out; the node id is kept for display.

`@deepseek-ai/dsh-plugin-manager/source` owns the standard as a pure, browser-safe module. It validates a descriptor, normalizes its parts, rejects a directory that could escape the source, and renders the install spec the manager already accepts:

| Form | Spec |
|---|---|
| git | `git+<url>#<ref>&path:/<directory>` (`HEAD` when only a directory is named) |
| archive | `<url>#path:/<directory>&sha256=<hex>`, or `archive+<url>` when the path alone does not end in an archive extension |
| drive | `drive+<url>#path:/<directory>` |

The manager parses those specs itself: `archive` and `drive` joined `InstallSpecKind`, `inspect` answers their form and host without fetching, and `installBundle` materializes them before pnpm runs. `archive.ts` downloads inside the profile, verifies the hash, refuses path escapes, bounds the download (128 MiB), the expansion (512 MiB, 20,000 files), and one file (64 MiB), reads zip through its central directory and tar/tar.gz through its headers, selects the named directory or strips one wrapping directory, and then installs the unpacked directory as a local path — so manifest writes, `dsh.bundle` validation, activation, and rollback stay the one pipeline. Repeated installs reuse `.plugin-manager/sources/<hash>`.

Both flows in `ui-sdkwork-markets` use the same form (`PluginSourceDialog`): creation records the identity and source and dispatches a prompt that names the package standard and the install spec the finished package must satisfy; installation turns the form's source into the spec and runs it through the plugin store's one install action. The cloud catalog's cards use a third path: the embedded App Store page now publishes each entry's `source` (from `metadata.pluginSource`, or the legacy `gitRepoUrl` plus an optional directory) and shows a source label; when the embedding host passes a `pluginsHost` port, the card's action installs the package through the Host instead of toggling a server flag. BirdCoder passes that port from `MarketsPage`, which normalizes the entry's source and opens the store's install session.

## Alternatives considered

**Teach pnpm the new forms.** pnpm cannot read an arbitrary zip, and a Drive directory has no URL until its owner resolves one. Materializing into a local directory keeps pnpm's install behavior (store, scripts, lockfile) unchanged.

**One install spec string per source, unvalidated.** A market could publish anything, and a browser could not refuse a `path:` that escapes the archive before downloading it. Splitting the descriptor from the rendered spec lets the form, the catalog, and the Host validate the same fields.

**One entry per plugin repository.** Monorepos that publish several plugins would need one repository per plugin or an out-of-band note. The directory is part of the source, so two entries can point at one repository and install different packages.

**A native App Store catalog inside BirdCoder.** The cloud catalog is the App Store's own page; replacing it would duplicate search, categories, and sign-in. The embed gained one optional port and the page keeps its chrome.

**Making creation write files directly.** Authoring a standard package is what the conversation and the available plugin-creation skill do; the form now gives them the identity, the source, and the acceptance check instead of a blank prompt.

## Consequences

- The host gained `source.ts` and `archive.ts`, two browser-safe exports (`/source`, `/archive`), and the `archive`/`drive` install kinds. `inspect`, `installBundle`, the failure-attribution host check, and `InstallSpecKind` cover them; the plugin-manager suite (475 tests, including a real pnpm install from a local HTTP archive) and the new source/archive specs pass.
- The markets page gained the source dialog, the add-menu row, a page-level install dialog for runs started outside the local rosters, and a cloud-catalog install port; the client bundle rebuilds against the sibling App Store sources.
- The App Store catalog gained `PluginSourceRef`/`PluginsHost`, source mapping from `metadata.pluginSource` (legacy `gitRepoUrl` fallback), a visible source label, and an install action on cards and the detail modal. A deployment without a host keeps the old enable toggle. Its runtime port has four specs covering each form, the fallback, and the registration metadata.
- A catalog entry without a source opens the source form instead of guessing; a Drive node is resolved by the caller, never by the plugin manager; archive installations stream no download progress and keep their unpacked copy.
