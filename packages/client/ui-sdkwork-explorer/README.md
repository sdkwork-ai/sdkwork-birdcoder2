---
description: "SDKWork explorer plugin: the `sdkwork-explorer` right-Sidebar tab type whose body is a VSCode-style tab strip; conversation file, applied-change, and link gestures open editor, diff-preview, and embedded-browser tabs, with open modes configurable in the settings center."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-explorer

English | [中文](README.zh.md)

## Summary

This plugin registers the `sdkwork-explorer` page type as a right-Sidebar tab (`ctx.sidebarRightTabs` + the keyed `sidebar.right.pane.tab` seat) whose body is the explorer's own tab strip. Conversation file and link gestures claimed over the package's cross-bundle DOM bus open read-only editor tabs, applied-change diff preview tabs, and embedded browser tabs inside it; a claim reveals the column by opening the page, and the panel's close button collapses the column. Open modes (built-in pane / system app / ask every time) persist through the Host settings document and are editable in the settings center; the diff preview is always built-in.
