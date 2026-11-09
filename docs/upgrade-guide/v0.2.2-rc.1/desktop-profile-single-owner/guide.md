---
kind: upgrade-guide
description: "A second BirdCoder Host over one profile now refuses to start instead of sharing it, so a development build pointed at the installed Harness home must use its own DSH_HOME."
---
# One Host owns a Desktop profile

English | [中文](guide.zh.md)

## Change

A Desktop profile now has exactly one writer Host. Electron's single-instance lock lives in the browser user-data directory, so it never saw a development or preview build started with another user-data directory but the installed `DSH_HOME`: that second Host shared the same sessions, and the assistant entered `Operational database is in recovery mode: lease-unavailable` because its operational database refuses a second writer.

The second Host now reports `Desktop profile is already in use: <profile>` and exits. The application shows its single-instance dialog with **Exit** and **Restart**, and the instance that already owns the profile keeps running.

## Migration

1. Quit the extra BirdCoder instance that serves the same `DSH_HOME`: the tray's Quit command, another desktop window, or the terminal running the development lane.
2. Keep development state separate. Run `pnpm run desktop:prod` or `pnpm run dev:desktop` without an inherited `DSH_HOME`, or pass a dedicated directory (`DSH_HOME=/path/to/dev-home pnpm run desktop:prod`).
3. Confirm the migration: the application window opens, and the assistant shows no `Operational database is in recovery mode` banner or `botharness roster stream failed` warnings.
