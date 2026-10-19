---
description: "OEM brand client plugin: applies the Host-published display name to the locale registry and the document title."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-oem

English | [中文](README.zh.md)

## Summary

The browser half of the OEM profile. At boot it reads the `__DSH_OEM__` page projection published by [`@deepseek-ai/dsh-sdkwork-oem`](../../host/sdkwork-oem/README.md), hands the display name to the locale registry, and titles the document with it. Every client dictionary string that spells `BirdCoder` then renders the deployment's name; the shipped `BirdCoder` remains the fallback when no profile exists.

The sidebar wordmark reads the same page projection directly through `readOemBrandName()` in [`ui-primitives`](../ui-primitives/README.md); the name is live SVG text, so a longer OEM name steps down inside the upstream wordmark's box rather than reflowing the slot.

## Model Experience

None, as the plugin changes display copy and the document title only.

#### KV Cache effect

None; this package assembles no provider request.

## Known Limitations and Deferred Work

- The web app manifest and `index.html` title stay build-time text; a profile renames the live document title and product copy, not the installed PWA name.
- Locale substitution replaces the exact `BirdCoder` spelling in dictionary templates. A deployment whose brand name contains that spelling in an unrelated word should choose a different brand.
- The H5 and mini-program apps are separate shells with their own product labels; the profile does not reach them.
