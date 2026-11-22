---
description: "SDKWork composed backend of the directory-picker seam: one ctx.directoryPicker serving both the native OS chooser and the browse primitives, so a desktop boot keeps the OS workspace dialog while in-app file browsing works."
kind: "package-reference"
---

# @deepseek-ai/dsh-sdkwork-directory-picker-composed

English | [中文](README.zh.md)

## Summary

The SDKWork composed interaction of the [directory-picker seam](../directory-picker/README.md): one `ctx.directoryPicker` capability that serves both shapes at once. `pick` delegates to the [native](../directory-picker-native/README.md) OS chooser, so an attended desktop boot keeps the OS workspace dialog, while `list`, `createDirectory`, `readTextFile`, and `writeTextFile` delegate to the [browse](../directory-picker-browse/README.md) backend's governed filesystem implementation. Compose it instead of a single-shape backend where a host that resolves `native` must still serve in-app directory browsing and governed text reads and writes from the same service.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

## Use this package

Compose this backend when the same host must keep the OS chooser for the workspace dialog and still answer the browse wire verbs. `ComposedDirectoryPicker` extends the browse backend and overrides `capability()`, so the service keeps the browse implementation's configuration, route, and lifecycle while its capability answers the merged shape.

The [SDKWork adaptive chooser](../sdkwork-directory-picker-auto/README.md) mounts this backend as its `native` arm; compose the row directly to pin it.

## Understand the implementation

The capability is one stable object per service life: `pick` forwards to the same chooser machinery the native backend drives, and every browse member forwards to the inherited browse implementation, which stays the single policy point for the governed fences.

| Member | Delegates to |
|---|---|
| `pick(signal)` | `pickNativeDirectory(signal)` |
| `list(path, signal)` | the inherited browse `list` |
| `createDirectory(path, name)` | the inherited browse `createDirectory` |
| `readTextFile(path, signal)` | the inherited browse `readTextFile` |
| `writeTextFile(path, content)` | the inherited browse `writeTextFile` |

`src/capability.ts` declares `DirectoryPickerComposedCapability`, the merged member set, and declaration-merges `composed` into the seam's `DirectoryPickerCapabilities` map, so a wire consumer reads it through the same typed capability accessor as the base kinds. The 1 MiB text bound, fully qualified path fence, and abortable operations come from the browse implementation rather than being restated here.

## Dev Note

The backend composes the platform pickers; each platform keeps its own native behavior.

## Model Experience

None, as the backend only resolves caller-picked directories and file bytes; it registers no tool, prompt section, or session event.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Platform behavior is delegated to the native host** — `pick` runs the OS chooser machinery the native backend uses, so its availability and platform quirks (macOS activation, Linux Zenity/KDialog, the Windows child process) follow that backend and are not adapted here; nothing renders on a host display without a chooser.
- **Wire consumers must admit the merged kind** — a consumer whose capability gate accepts only `native` or `browse` refuses `composed`; it is visible only through the seam's declaration-merged capabilities map (the workspace controller's gate is the current adopter).
- **Both surfaces are served, so neither can be withdrawn** — the composed capability always advertises the browse members; a deployment that wants to forbid in-app filesystem access must compose the plain native backend instead.
