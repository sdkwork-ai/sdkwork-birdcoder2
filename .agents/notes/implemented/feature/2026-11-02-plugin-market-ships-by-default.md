# Agent Note: The plugin market ships by default

Status: implemented

English | [中文](2026-11-02-plugin-market-ships-by-default.zh.md)

## Problem

The Plugins tab of the Markets page leads with the community plugin market, and the page decided that chip's face from one fact: whether the plugin store lists a `dshmarket` bundle. A shipped BirdCoder profile carries exactly `@deepseek-ai/dsh-base` and `@deepseek-ai/dsh-web-app` (`PROFILE_TEMPLATES.web`), and nothing in that closure mounted the market, so the bundle list never contained it, no `market` control was published, and the landing view of the product's plugin surface rendered "插件市场还未安装" with an install button — an installer prompt where the product's own catalog should be.

## Decision

`dshmarket` becomes part of the installation the Web bundle ships, mounted by that bundle's own patch, so every profile that composes `dsh-web-app` has the market with no installer step. The desktop bundle patches over `dsh-web-app` and inherits both the dependency and the row.

- `packages/bundle/web-app/package.json` declares `"dshmarket": "^1.73.8"`, and `pnpm-lock.yaml` pins the exact published release.
- `packages/bundle/web-app/cordis.patch.yml` carries one row, `dsh-market`, named `dshmarket` — the id the market's own bundle patch inserts, so one overlay id covers both mount paths.
- The package's own `dsh.bundle.patch` stays out of every profile's bundle list; this row is the single mount, matching how the built-in skill market and MCP connector are composed ([built-in skill market](../architecture/2026-11-01-built-in-skill-market-plugin.md)).

The market is a registry package rather than a git-linked submodule because its repository builds `lib/` and the browser half in a `prepack` step: a gitlink would ship sources, and this repository runs third-party build artifacts as published instead of building them (the skill-market submodule commits its `lib/`, which is why that route works there).

Composing it from the bundle, rather than seeding a `dshmarket` bundle into each profile, is what makes the fix reach existing installations: `initProfile` never rewrites an initialized profile, so a profile-level default only helps a fresh home and would need a migration that writes into user data.

## What the mount is

The market publishes its panel as the `market` client service (`ctx.provide('market', …)`, contract version 1 with `render`) and serves `/dsh-market/*` from its host half. The Plugins tab consumes that service as an optional dependency and renders the panel in place, so the leading chip becomes the live catalog. The four faces the page already owned stay defined: with the row switched off by a profile overlay the install affordance returns, and a build whose browser half has not loaded yet still shows the reload prompt.

`ui-sdkwork-markets` keeps declaring no version, dependency, or update logic for the market. The one contract between the two packages — service name `market`, contract version 1, a `render` method — is what the page checks before rendering.

## Consequences

A shipped Web or desktop build opens the plugin surface on a browsable community catalog. The market is host-mounted: its `/dsh-market/status` answers `selfManaged: false`, so it hides its own update and remove card, the fork's installed roster does not list it (the profile selects no such bundle), and the app's release cadence owns the pin — a market release reaches users by bumping `^1.73.8` and regenerating the lockfile. A deployment that wants the market gone disables the row in its profile patch; the Plugins tab then falls back to the install affordance.

The dependency adds `undici` and `js-yaml` to the runtime closure of every Web installation. The desktop runtime materializes external registry dependencies like any other npm package, so the packaged app carries the market without a first-run download.

The page's `pending` and `disabled` faces are decided by the plugin store's bundle list, which no longer contains the market in a default installation; they remain reachable for a deployment that installs the `dshmarket` bundle into its profile instead of using the row.

## Verification

`packages/bundle/web-app/tests/built-in-plugin-market.spec.ts` asserts the composed row and its enablement, that the package resolves from this bundle with both halves declared and shipped, that the host half injects `webServer` and mounts the market routes, that the browser half publishes the `market` control with contract version 1 and a `render` method, and that neither desktop override layer disables or re-points the row.

Real composition: a scratch `$DSH_HOME` whose `web` profile lists only `@deepseek-ai/dsh-base` and `@deepseek-ai/dsh-web-app` boots `dsh web` with no market install; `/dsh-market/status` answers `{"version":"1.73.8", …, "selfManaged":false}` from the host half, and the shell document preloads `dshmarket/client.js` from the client-modules roster, so the browser half is in the page's load graph. `pnpm exec vitest run packages/bundle/web-app packages/client/ui-sdkwork-markets` covers the composition and the page.

## Alternatives considered

**Leave the market install-on-demand.** The chip stays discoverable and a deployment that wants no community catalog never fetches one, but the landing view of the product's own plugin surface is then an installer prompt, which is the defect this note fixes.

**Git-link the market as the skill market does.** It keeps the pin a reviewable revision, but the package publishes built artifacts only, so this repository would have to build a third-party package it does not own.

**Select a `dshmarket` bundle in every profile.** This makes the market self-managed — its own update card works — but `initProfile` never rewrites an existing profile, so installed applications would not gain the market, and a migration would have to edit user data on upgrade.

**Mount it in the desktop bundle only.** The Web product renders the same Plugins page and expects the same catalog; a desktop-only row would leave `dsh web` opening on the installer prompt.
