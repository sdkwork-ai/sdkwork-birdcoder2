---
name: birdcoder-unity-app
description: Use when developing Unity applications and games — scenes and prefabs, C# scripts and lifecycle, physics/coroutines, UI (UGUI/UI Toolkit), and Unity build/player-settings tooling.
---

# Unity Application Development

Build a Unity feature with clean C# and an inspectable scene structure.

## Workflow

1. Read the project's conventions: assembly definitions, folder layout (Scripts/Prefabs/Scenes), and whether it uses MonoBehaviour-heavy or dependency-injected patterns — follow it.
2. Scripts: lifecycle methods (Awake/Start/Update) do their named job only; heavy logic in plain C# classes; `Update` without work per frame is deleted.
3. References via serialized fields (prefabs/ScriptableObjects) instead of `Find*` lookups; instantiate/pool per the project's pattern.
4. Coroutines for frame-spread work, async/await with UnitySynchronizationContext or UniTask where the project uses it; physics in FixedUpdate.
5. Verify: compiles with no warnings in the target Unity version, the scene plays the changed feature correctly; describe the scene/setup to check manually.

## Rules

- No per-frame allocations in hot paths (GC spikes show on device, not in editor).
- Scene hierarchy and prefab changes are part of the change — describe them, since they do not survive as code diffs.
