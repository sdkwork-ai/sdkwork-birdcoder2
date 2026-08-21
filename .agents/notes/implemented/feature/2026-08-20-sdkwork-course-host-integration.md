# Agent Note: SDKWork Course host integration

Status: implemented

English | [中文](2026-08-20-sdkwork-course-host-integration.zh.md)

## Problem

The Course rail entry needs to open the existing SDKWork Course PC application inside BirdCoder. The application expects a generated Course app client, session and locale ports, and Tailwind output, while BirdCoder already owns deployment, authentication, locale, navigation state, and a client loader that evaluates one browser closure per plugin.

## Decision

`@deepseek-ai/dsh-client-ui-sdkwork-course` is an independent mode plugin in the app-mode rail. Its entry calls the layout store's existing `setMode('course')` action, and its keyed `mode.page` registration mounts the SDKWork application in the center column. The mode is transient layout state: Course navigation adds neither a browser route nor a persisted BirdCoder preference.

The `courseHost.ts` module inside `@deepseek-ai/dsh-client-ui-sdkwork-course` owns the SDKWork host adaptation. The plugin configures it from the existing `ctx.env`, `ctx.iam`, `ctx.locale`, and `ctx.theme` services before registering the page. The adapter constructs the generated Course client lazily for the active API base URL, syncs IAM credentials through the shared SDKWork token manager, maps host user profile fields into the Course session snapshot, and remounts `CourseView` when the API environment changes. Locale changes propagate through SDKWork subscriptions without a remount.

`CourseApp` keys the SDKWork `CourseView` by the environment revision. `@sdkwork/course-pc-course` reads the host ports (`getCourseClient`, `readHostSession`, `subscribeHostSession`, `resolveHostLanguage`, `subscribeHostLanguage`) through `configureCoursePcRuntime`.

## Type and bundle integration

The package follows the same split as `@deepseek-ai/dsh-client-ui-sdkwork-drive`: declaration emit skips strict checking of the sibling SDKWork implementation, and `tsconfig.tests.json` compiles the consumed SDKWork source closure with one React type identity.

The browser build emits one tree-shaken `client.js` closure. The bundle face compiles SDKWork's Tailwind stylesheet from `sdkwork-course-pc` sources and injects the styles idempotently.

## Alternatives considered

| Rejected | Reason |
|---|---|
| Add URL routing or persist the Course mode | The layout store already owns mode selection |
| Introduce a Course-specific auth or environment store | `ui-sdkwork-env` and `ui-sdkwork-iam` already own those facts |
| Import SDKWork internals directly from `CoursePage` | The page would own generated-client and session adaptation details |
| Emit multiple browser chunks | BirdCoder serves only the registered plugin `client.js` |

## Consequences

Clicking the Course rail icon replaces the Code conversation with the real SDKWork Course surface, and returning to Code restores the workbench. SDKWork business HTTP requests remain browser traffic and add no Harness prompt content, tools, session events, or KV Cache input.

The integration requires the `../sdkwork-course` sibling checkout and generated clients. One browser window has one active SDKWork Course host adapter because the Course PC runtime ports are process-global.

## Verification

Facade tests pin session mapping, locale, environment-revision, and disposal behavior; an integration spec configures the real host adapter and mounts the SDKWork surface in jsdom. Plugin tests pin declared injection, keyed registration, teardown, and the SDKWork page marker. The assembled web mode test clicks the Knowledge, Course, and Drive entries and verifies that each SDKWork page replaces the conversation. The SDKWork source-check project and bundle inspection pin the real source closure, single-file output, and compiled Tailwind styles.
