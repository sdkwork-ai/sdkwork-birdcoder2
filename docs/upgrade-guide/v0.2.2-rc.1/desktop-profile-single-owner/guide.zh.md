---
kind: upgrade-guide
description: "同一 profile 上的第二个 BirdCoder Host 现在会拒绝启动而不是与其共享，因此指向已安装 Harness home 的开发版必须使用自己的 DSH_HOME。"
---
# 一个 Host 独占一个 Desktop profile

[English](guide.md) | 中文

## 变更

Desktop profile 现在只允许一个写入 Host。Electron 的单实例锁位于浏览器 user-data 目录，因此看不到使用另一个 user-data 目录、却指向已安装 `DSH_HOME` 的开发版或预览版：第二个 Host 会共享同一批会话，助理则因运行数据库拒绝第二个写入者而进入 `Operational database is in recovery mode: lease-unavailable`。

第二个 Host 现在报告 `Desktop profile is already in use: <profile>` 并退出。应用显示带**退出**和**重启**的单实例对话框，已占用该 profile 的实例继续运行。

## 迁移

1. 退出占用同一 `DSH_HOME` 的多余 BirdCoder 实例：托盘的退出命令、另一个桌面窗口，或运行开发版的终端。
2. 保持开发状态独立。运行 `pnpm run desktop:prod` 或 `pnpm run dev:desktop` 时不要继承 `DSH_HOME`，或传入专用目录（`DSH_HOME=/path/to/dev-home pnpm run desktop:prod`）。
3. 确认迁移完成：应用窗口正常打开，助理不再显示 `Operational database is in recovery mode` 提示或 `botharness roster stream failed` 警告。
