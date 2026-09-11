---
name: birdcoder-html-web
description: Use when building a static website with plain HTML, CSS, and vanilla JavaScript — semantic markup, responsive layout, accessibility, and small interactive behaviors without any framework or build step.
---

# HTML Website Development

Build a framework-free website that is fast, semantic, and accessible.

## Workflow

1. Structure the page with semantic elements (header/nav/main/section/footer); one h1 per page, headings in order.
2. Style with plain CSS: mobile-first responsive layout (flex/grid), custom properties for the palette, and system-font-first typography.
3. JavaScript only where behavior needs it: vanilla ES modules, progressive enhancement — the content works with scripts disabled.
4. Accessibility as part of markup: alt text, label-associated form fields, visible focus, keyboard-operable menus.
5. Verify: valid HTML, responsive check at mobile/tablet/desktop widths, and Lighthouse-style pass on images (sized, lazy-loaded below the fold).

## Rules

- No framework or build step unless the project already has one — plain files stay deployable anywhere.
- Content and structure live in HTML; presentation in CSS; behavior in JS — never inline styles or script into markup.
