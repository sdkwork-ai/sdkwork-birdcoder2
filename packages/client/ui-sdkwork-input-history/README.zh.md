---
description: "SDKWork 输入历史插件：在浏览器本地记录 Host 已接受的输入框消息，并让聊天输入框用 ↑/↓ 按会话、项目或全部会话回溯，自带独立的设置页。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-input-history

[English](README.md) | 中文

## 概述

输入框本身不保留历史：消息发出后文本就离开了编辑器。本插件把每一条 Host 接受的普通消息记录到浏览器本地，并让输入框在无修饰键时用 ↑/↓ 回溯：↑ 走向更早的记录，↓ 走向更新的记录，越过最新一条后恢复被回溯打断的草稿；且只有在草稿为空或光标位于所询问的边缘时才开始一次新的回溯。它的「输入历史」设置页选择范围——当前会话（默认）、当前项目或本浏览器全部会话——以及缓存时长（默认 30 天），并可一键清除缓存。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>

## 使用本包

插件以 web-app 的 `ui-sdkwork-input-history` 行挂载。激活后会记录被接受的消息，并在「设置 → 输入历史」提供设置页。关闭该能力会同时停止记录与回溯；已保存的账本会保留，直到被清除或过期。

历史按浏览器 profile 保存，不按账号或机器同步：换浏览器或清除站点数据即丢失。

<a id="understand-the-implementation"></a>

## 理解实现

- `src/client/index.ts`——注册词典与 `settings.section` 设置页，然后接上两个扩展点：`ctx.shortcuts.observeFixedInput` 负责键盘手势，`ctx.on('conversation/input-accepted')` 负责记录。它的 `inject` 是唯一接触的服务面。
- `src/client/input-history-store.ts`——持久账本：localStorage 文档（`dsh.inputHistory.v1`）、结构与条目归一化、同一会话重复消息去重、500 条与 500,000 字符上限、按范围读取，以及在所有读写路径和每小时清扫中执行保留期裁剪。
- `src/client/input-history-controller.ts`——键盘手势：从卡片的 `data-composer-session-id` 解析输入框所属会话，拒绝已被输入框自身消费的按键（`defaultPrevented`）、组词中的按键、修饰键组合以及光标不在边缘的位置，再通过会话输入 facade（`setDraft`）写入选中的记录。回溯出的记录显示时，方向键只有从文档边缘才会继续回溯；在记录内部则仍用于移动光标。
- `src/client/composer-target.ts`——DOM 契约：输入框可编辑区（`data-composer-input`）、其会话卡片，以及光标边界判断。
- `src/client/InputHistorySection.tsx`——设置页：开关/范围的即时写入、暂存后再提交的缓存天数字段、已缓存条数与清除。

本插件消费的两项事实由 conversation 包提供：`conversation/input-accepted` 事件（Host 接受后发出，命令提交不会触发）和输入框卡片的会话标识属性。

### 范围与保留期

范围在读取时从同一账本解析。每个条目携带发送它的会话和该会话工作目录产生的项目键；设置决定 ↑/↓ 走哪一片。因此切换范围即时生效且不丢历史。条目一旦超过保留期就不可再被回溯，无论每小时清扫是否已经运行。

<a id="known-limitations-and-deferred-work"></a>

## 开发备注

这是遵循仓库命名契约的 fork 包（`sdkwork` 标记）。它是纯浏览器插件：Node 半边是空的 `apply`。

## 运行时不变式

spec 套件验证：销毁插件 fiber 会一并移除设置页、固定键盘观察器和已接受消息监听器（HMR 安全）。

## 模型体验

无：本包是浏览器侧的输入框呈现状态；账本不会进入 prompt、工具结果或会话日志，且只会在 Host 接受消息之后记录。

#### KV Cache effect

无；不组装也不修改任何 provider 请求。

## 已知限制与后续工作

- 历史只存在于单个浏览器 profile；没有 Host 侧存储、同步或跨设备回溯。多个标签页之间不会同步账本——最后写入者生效。
- 账本不按登录账号分区，登出也不会清除；在共享浏览器 profile 上切换账号前，请先在设置页清除。
- 记录从插件启用时开始：启用前或账本存在前发送的消息不会从会话记录中回填。
- 只记录被接受的普通消息。命令提交（`/…`）、队列中被编辑过的消息以及发送失败的内容都不是候选记录。
- 超过 100,000 字符的 prompt 不会被缓存；账本最多保留 500 条 / 500,000 字符文本，更早的条目先被移除。
- 回溯会替换整份草稿。被打断草稿中的内联引用 chip 与附件只按剪贴板文本恢复（附件仍留在输入框中，因为替换文本不会清除附件）。
- 手势信任按键发生时的输入框光标；不渲染 `data-composer-input` / `data-composer-session-id` 的自定义编辑器无法使用回溯。
