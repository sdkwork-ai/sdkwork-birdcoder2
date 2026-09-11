# Agent Note: 行菜单路径动作回报结局，而非静默失败

Status: implemented

[English](2026-09-10-row-menu-path-actions-report-outcome.md) | 中文

## 问题

侧边栏行菜单的「打开文件夹」「在终端打开」把 `workspaces.openPath`/`openTerminal` 与剪贴板写入走同一个吞掉一切的辅助函数。Host 拒绝 RPC 时，拒绝落在 `runAction` 的空 catch 里，点击表现为一行死菜单。正是这种静默让[桌面 `/api` 回退中断](2026-09-10-desktop-host-api-fallback-and-explorer-reveal.zh.md)看起来像"菜单压根没实现"或"权限问题"：渲染进程没有任何渠道说出"请求已发出但被拒绝"。同样的静默也覆盖未来的每一次拒绝——没有桌面打开器的 Host（无头 Linux 部署上 `host.describe.canOpenPath: false`）、已被删除的工作目录、或过期的已安装组合。

## 决策

两个 Host RPC 的结局通过 `ui-primitives` 的 `Toast` 横幅回报；剪贴板写入保持即发即忘。成功显示字典里的已请求文案（`feedback.opened` / `feedback.terminalOpened`——这两个键此前就在命名空间里但从未被使用），失败显示可重试文案（`feedback.openFailed` / `feedback.terminalFailed`），Host 的原始错误文本作为诊断进控制台而非产品文案。回报路径绝不向上抛：派发依旧不可能把异常抛出菜单点击，降级行为的用例固定了这一点。序列号作为重挂载键，连续动作会重启横幅的停留窗口。

横幅经一个共享 hook 进入两个菜单组件（`WorkspaceRowMenu`、`SessionRowMenu`），因为各自持有派发；插件契约（`RowMenusWorkspacesPort`、槽位 owner props）不变，因此没有消费者或组合行需要移动。

## 曾考虑的替代方案

**照 ui-deliverables 的做法用 `host.describe` 的 `canOpenPath` 门控行。** 暂不采纳：行菜单插件只拿到 `workspaces` 端口，门控需要新的注入服务面、slots 契约变更与同一次变更里的组合更新。横幅用小得多的表面回答了本次上报的失败；没有桌面的 Host 在 RPC 被接受时仍会显示已打开，因为 `host.openPath` 只有在打开真正失败时才在打开器处拒绝，而那次拒绝现在读作"无法打开文件夹，请重试"而非静默。

**横幅里展示 Host 的错误原文。** 否决：apiproxy 的失败消息携带 PowerShell stderr 与代码词汇；横幅是顶部四秒的窄条，可行动的文案是"请重试"加控制台一行。

## 影响

被拒绝的打开文件夹手势现在会在界面里自述，并留下控制台诊断——下一次组合中断会是带证据的缺陷报告，而不是"按钮没反应"。已请求横幅同时在成功时记录了 RPC 已被接受，这在远程或无头 Host 上才是诚实的陈述：Host 接受了打开动作，不等于用户的机器打开了窗口。本插件未来新增的路径动作面都经 `dispatchPathAction` 继承这套回报。

## 验证

`pnpm vitest run ui-sdkwork-workspace-row-menus`（21 个用例）覆盖已请求横幅、`openPath` 拒绝时的可重试横幅加控制台 spy，以及既有的降级行；ui-workspace 的槽位集成套件 `row-menus-plugin.client.spec` 原样通过。包 bundle 已重建（`pnpm run bundle`），桌面载体在下一次壳重启后提供新修订。

针对已安装桌面项目的端到端探针直接驱动了 Electron 壳 spawn 的同一入口 `runDesktopHost`：`host.describe` 返回 200 且 `canOpenPath: true`，`host.openPath` 返回 `{ opened: true }` 并为目标目录弹出了真实的资源管理器窗口——该手势的 Host 侧（含特权方法的回环围栏）在当前组合上可用。
