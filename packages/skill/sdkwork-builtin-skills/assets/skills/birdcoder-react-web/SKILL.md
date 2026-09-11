---
name: birdcoder-react-web
description: Use when developing React-based websites or web apps — function components and hooks, state management, routing, data fetching patterns, react-hooks lint cleanliness, and React build/test tooling (vite, testing-library).
---

# React Web Development

Build React features with clean component boundaries and hook discipline.

## Workflow

1. Read neighboring components first: state approach (hooks-only or a store), styling system, and routing — follow the project's pattern.
2. Components: small function components, props typed, lists keyed stably; custom hooks (`use*`) own reusable logic and cleanup.
3. Hooks rules: full dependency arrays with cleanup for effects; derived state computed during render, not synchronized in effects; no state duplication of server data.
4. Data flows UI → service → injected client: components never assemble raw HTTP/auth concerns; loading/error/empty states are explicit.
5. Verify: typecheck, `react-hooks` lint clean, and component tests with @testing-library for the changed behavior; describe the view/route to check manually.

## Rules

- No `useEffect` for things a render or event handler can do; effects exist to synchronize with external systems.
- Error boundaries guard the route/page; a crashed subtree never blanks the whole app.
