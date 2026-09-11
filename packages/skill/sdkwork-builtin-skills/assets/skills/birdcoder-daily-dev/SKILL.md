---
name: birdcoder-daily-dev
description: Use for everyday feature and bug-fix work in an existing codebase — reading surrounding code, making a scoped change, adding or updating tests, and reporting what changed. Covers routine refactors, dependency bumps, and small utilities.
---

# Daily Development

Drive a normal feature/fix change end to end with the smallest safe diff.

## Workflow

1. Locate the change surface: read the neighboring code and tests first; follow the file's existing naming, error, and comment conventions.
2. Plan the smallest change that satisfies the request; call out anything intentionally left out of scope.
3. Edit. Keep the public surface stable unless the request demands otherwise; never delete a dependency while source still imports it.
4. Add or update focused tests that pin the changed behavior (not implementation details).
5. Run the narrowest relevant check (typecheck plus the touched package's tests) and report results verbatim.

## Reporting

Summarize: what changed, why, what was verified, and any follow-up work the change implies.
