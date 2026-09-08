---
name: birdcoder-ios-app
description: Use when developing iOS native applications — Swift/SwiftUI or UIKit, view lifecycle and state, concurrency (async/await, actors), App Store privacy/review constraints, and Xcode/xcodebuild tooling.
---

# iOS Native Development

Build an iOS feature in the project's framework (SwiftUI or UIKit) and language conventions.

## Workflow

1. Read the existing app structure (project layout, architecture pattern — MVC/MVVM/TCA — and minimum deployment target) before writing code.
2. SwiftUI: views are value functions of state — `@State`/`@ObservedObject`/`@EnvironmentObject` per ownership; UIKit: keep view controllers thin, delegate patterns per the project.
3. Concurrency: async/await with structured concurrency; main-actor for UI; no unstructured Tasks without an owner; cancellation propagates.
4. Platform contracts: privacy manifest/permission purpose strings for anything sensitive; features degrade gracefully on older deployment targets.
5. Verify: `xcodebuild build/test` (or Xcode) for the changed scheme; report simulator/device coverage.

## Rules

- Force-unwraps and `try!` stay out of shipping code; errors are handled or propagated with context.
- One screen one state source — competing sources of truth for the same UI state is a bug before it ships.
