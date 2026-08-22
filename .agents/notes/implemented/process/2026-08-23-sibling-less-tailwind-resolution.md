# Agent Note: Tailwind resolution must not depend on sibling node_modules

Status: implemented

English | [中文](2026-08-23-sibling-less-tailwind-resolution.zh.md)

## Problem

`Release (dsh)` failed in `build:lib:client` with `[plugin dsh-appstore-tailwind-css] Can't resolve 'tailwindcss'`. The Tailwind compile plugins run with stylesheets inside sibling SDKWork checkouts (`../sdkwork-*`). Local development works because the siblings carry their own installs, but the release runner clones the pinned siblings via `setup-sdkwork-siblings` without `node_modules`, so `@tailwindcss/node`'s default resolution from the stylesheet directory fails.

## Decision

The Tailwind compile plugins pass `customCssResolver` and `customJsResolver` from a shared `tailwindResolvers(import.meta.url)` helper in `packages/client/tsdown.client.ts`. The resolvers load bare modules through the declaring package's own install (each declaring package lists the Tailwind runtime and plugins it compiles as devDependencies), falling back to default resolution for ids the package does not install. `ui-sdkwork-appstore` additionally declares `tailwindcss-animate` because its stylesheet uses `@plugin "tailwindcss-animate"`.

The stylesheet side loads the bare `tailwindcss` id through its `style` field (`tailwindcss/index.css`); the JavaScript side resolves the module entry.

## Consequences

The Client pass builds identically with or without sibling `node_modules`: local checkouts and the release runner produce the same bundles. Unresolved bare imports from sibling sources (reported by rolldown as warnings on the runner only) do not change the artifact's externals.

## Testing

Local simulation of the release runner (sibling root `node_modules` hidden): the Client tsdown pass completes. With siblings restored, the same pass completes with zero warnings.
