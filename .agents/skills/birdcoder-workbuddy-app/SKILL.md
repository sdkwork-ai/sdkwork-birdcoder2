---
name: birdcoder-workbuddy-app
description: Use when building applications on the Workbuddy platform — implementing product features that run inside a Workbuddy host, from reading the host's app surface to a runnable, verified app.
---

# Workbuddy Application Development

Build an application that runs well inside the Workbuddy host.

## Workflow

1. Read the host's application documentation and the platform conventions first: supported app types, project scaffold, data/permission model, and how apps integrate with the host's UI and services.
2. Scaffold the app per the host's template; follow its state, styling, and lifecycle patterns; keep platform-specific code behind the host's provided abstractions.
3. Build the feature with the host's typed APIs and UI kit — no direct DOM/global hacks that bypass the host's layout and theming.
4. Handle lifecycle and capability states explicitly: loading, empty, error, and permission-denied are all first-class screens.
5. Verify against the host: run the app, exercise the changed flow, and confirm clean exit/teardown.

## Rules

- If the request needs a host capability the platform does not expose, surface the gap and propose the closest supported alternative.
- User-visible copy follows the platform's localization approach; never hardcode display strings.
