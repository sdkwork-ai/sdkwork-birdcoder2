---
name: birdcoder-harmonyos
description: Use when developing HarmonyOS native applications — ArkTS/ArkUI declarative UI, abilities and stage model, state management decorators, distributed capabilities, and DevEco Studio build/hvigor tooling.
---

# HarmonyOS Native Development

Build a HarmonyOS app with ArkTS/ArkUI on the stage model.

## Workflow

1. Read the project's module layout (`entry`/feature modules, `module.json5`) and follow its ability and page structure.
2. UI in declarative ArkUI: components compose in `build()`; state via the decorators (@State/@Prop/@Link/@Provide or the persistence variants) — one decorator per ownership story, never mixed ad hoc.
3. Abilities: lifecycle (onCreate/onForeground/onWindowStageCreate) wired per stage model; permissions declared in `module.json5` with reason strings.
4. Navigation via the project's router/Navigation pattern; capabilities unavailable on the target API version are feature-gated, not crashed.
5. Verify: hvigor build for the declared targets, `arkTSLint`/DevEco checks, and describe what to preview in the emulator or device.

## Rules

- No `any` in ArkTS — its strict mode is the platform contract; type the model once and reuse it.
- UI components stay pure: state changes trigger re-render; imperative DOM-style mutation has no place here.
