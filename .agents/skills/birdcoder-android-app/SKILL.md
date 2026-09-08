---
name: birdcoder-android-app
description: Use when developing Android native applications — Kotlin, Jetpack Compose or Views, lifecycle and architecture components, coroutines/Flow, permissions, and Gradle build/test tooling.
---

# Android Native Development

Build an Android feature with Kotlin and the project's architecture (Compose/Views + architecture components).

## Workflow

1. Read the project's module/package structure, DI setup (Hilt/Koin), and UI toolkit (Compose vs XML Views) first — follow it.
2. Compose: state hoisting, recomposition-safe lambdas, `remember`/`derivedStateOf` where measured; Views: ViewBinding, no findViewById drift.
3. Lifecycle: coroutines scoped to the ViewModel/lifecycle (`viewModelScope`, `repeatOnLifecycle` for Flow collection); no leaks of Activity/Fragment context past its lifetime.
4. Data and permissions: repository-owned data flows; runtime permissions requested in context with a graceful denied path; background work via WorkManager.
5. Verify: `./gradlew` assemble + unit tests for the changed module, lint clean; describe what to exercise on device/emulator.

## Rules

- Configuration-change survival is part of done: process death and rotation do not lose user state.
- No blocking calls on the main thread; every network/disk hop is suspend or callback-offloaded.
