---
name: birdcoder-miniprogram
description: Use when developing WeChat/Alipay or other mini-program applications — pages and components, app.json configuration, lifecycle, storage, subscription messages, payment, and platform review-compliance pitfalls.
---

# Mini-program Development

Build a mini-program that passes platform review and runs well on low-end devices.

## Workflow

1. Confirm the target platform (WeChat/Alipay/Douyin) and baseline library version; project structure follows that platform's convention (`app.json`/`pages` or equivalent).
2. Pages: one directory per page (wxml/tsc/js/css or framework equivalent); navigation, share, and lifecycle hooks wired per platform docs.
3. Capabilities: storage, login/code2session, subscription messages, payment — each behind the platform's API with failure paths handled.
4. Respect platform limits: package size (subpackages when over), request domains whitelist, and review rules (no induced sharing, virtual-payment restrictions).
5. Verify in the platform devtools simulator with a real-device preview; report what was tested.

## Rules

- Platform API differences stay behind one wrapper module, never scattered across pages.
- Every network call has loading, failure, and empty states — miniprogram users retry by re-entering the page.
