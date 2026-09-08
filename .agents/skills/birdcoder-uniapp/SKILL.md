---
name: birdcoder-uniapp
description: Use when developing uni-app cross-platform applications — pages, conditional compilation, uni.* APIs, multi-platform adaptation (H5/WeChat/App), and uni-app build and preview tooling.
---

# uni-app Development

Build a uni-app feature that works across H5, mini-program, and App targets.

## Workflow

1. Confirm the target platforms for this feature; read existing pages and `pages.json` conventions (navigation bar, tab pages) first.
2. Pages/components follow uni-app structure (vue SFCs + `pages.json` registration); use `uni.*` APIs instead of web-only ones (storage, request, toast).
3. Platform differences go through conditional compilation (`#ifdef H5 / MP-WEIXIN / APP-PLUS`) — keep each block small and named by capability.
4. UI: prefer the project's component library or uni-ui components that render on every target; avoid DOM APIs that break mini-program targets.
5. Verify per target: H5 build in the browser, mini-program in the platform devtools, App via HBuilderX/custom base — report which targets were checked.

## Rules

- Every `#ifdef` states why the platform differs; unmarked divergences rot.
- One feature branch compiles for all declared targets before it is done — a H5-only regression is still a regression.
