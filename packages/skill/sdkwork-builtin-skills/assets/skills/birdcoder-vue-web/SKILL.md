---
name: birdcoder-vue-web
description: Use when developing Vue-based websites or web apps — SFC components, composition API, reactivity, Pinia/Vuex state, Vue Router, and Vue-specific tooling (vite, vitest, eslint-plugin-vue).
---

# Vue Web Development

Build Vue features with the composition API and the project's existing conventions.

## Workflow

1. Read neighboring SFCs first: `<script setup>` vs options API, state library, router patterns — follow the project, never mix paradigms in one feature.
2. Components: props down / events up; `defineProps`/`defineEmits` typed; composable functions (`use*`) own reusable reactive logic.
3. Reactivity rules: no destructuring of reactive objects without `toRefs`, no mutating props, computed for derived state instead of watchers where possible.
4. State that outlives a component lives in the project's store (Pinia/Vuex); server state goes through the project's request layer.
5. Verify: `vue-tsc`/typecheck, lint (`eslint-plugin-vue`), and component tests for the changed feature; describe the route/view to check manually.

## Rules

- Template logic stays in the script: extract conditionals into computeds.
- User-visible copy is i18n-owned; never hardcode display strings in templates.
