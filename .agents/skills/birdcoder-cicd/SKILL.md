---
name: birdcoder-cicd
description: Use for CI/CD work — GitHub Actions workflows, build and test pipelines, release automation, caching, matrix builds, and diagnosing why a pipeline failed or got slower.
---

# CI/CD

Keep pipelines fast, deterministic, and informative.

## Workflow

1. Read the existing workflow before changing it; match its job split, runner choices, and caching patterns.
2. Diagnose failures from the log bottom-up: the first failing step and its real error, not the cascade after it.
3. Prefer narrowing the trigger surface (paths, filters) and caching dependencies over adding manual steps.
4. Keep secrets in the platform's secret store; never echo them, never inline them.
5. Prove the change: a locally reproduced failing step, or the smallest push that exercises the new path.

## Reliability rules

- Pin action versions; avoid floating tags on release paths.
- Every job must fail loudly — no `continue-on-error` that hides red signals.
- Record what the pipeline now gates so the next change knows what breaking means.
