# Agent Note：桌面名册把 PTC 模式列了两遍，第二个无法切换

Status: implemented

[English](2026-08-30-desktop-duplicate-ptc-preset.md) | 中文

## 问题

第二次上游同步之后，桌面壳的模式选择器里出现了**两个名为「PTC 模式」的条目**，靠下那一个切换不过去。

上游的两次变更撞上了 fork 自有的一份目录：

1. 上游把 code mode 改名为 PTC mode（[`3ca9c7d489`](https://github.com/deepseek-ai/deepseek-harness/commit/3ca9c7d489)）：preset 目录 `code` 变成 `ptc`，呈现行的 `mode` 取值变成 `ptc`。`@deepseek-ai/dsh-agent-tool-presentation` 现在只接受 `z.union(['native', 'ptc', 'both'])`，于是 `mode: code` 在挂载时被拒绝。
2. 上游把内置 preset 搬进了插件（[2026-08-20 说明](../bug-fix/2026-08-20-plugin-owned-shipped-preset-root.zh.md)）：`dsh-agent-presets` 把自己的 `presets/` 前置为 `system` 根，排在 `config.roots` 之前。

桌面壳从 [`9cb7a27ee2`](https://github.com/sdkwork-ai/sdkwork-birdcoder2/commit/9cb7a27ee2) 起自带一份 preset 根 —— `apps/desktop/config/agent-presets`，是当时 `apps/cli` preset 的快照，因为 CLI 自己的那份进不了打包产物所以随应用打进去。这份快照里还留着改名前的 `code` 目录，而它的 `preset.yml` 后来已经跟上了新措辞：`name: PTC 模式`、`order: 2`。

两个根同时生效时，`discoverPresets` 按 **id 去重，先出现的根胜出**。插件根提供 `standard`、`ptc`、`minimal`、`cordis`；桌面根提供 `standard`、`code`、`minimal`、`cordis`。三个 id 被插件遮蔽，`code` 没有同名者于是留存 —— 名册变成五行，第二个根的条目追加在第一个根之后：

| order | id | 显示名 | 状态 |
| --- | --- | --- | --- |
| 1 | `standard` | 标准模式 | 健康 |
| 2 | `ptc` | PTC 模式 | 健康 |
| 3 | `minimal` | 极简模式 | 健康 |
| 4 | `cordis` | 创造模式 | 健康 |
| 2 | `code` | PTC 模式 | `mode: code` 被 schema 拒绝 → 挂载失败 |

最下面那条就是用户切不过去的：`select` 会按该 preset 重新组装空白会话的 agent，也就是挂载它，而挂载在呈现行的 config 上被拒。

遮蔽还意味着桌面根里的 `standard` 和 `cordis` 是**死配置** —— 过期的副本（没有 `command-goal`、没有 `modelSelectionSettings`、`fetch: false`，`SKILL.md` 里还写着 `code` preset），任何编辑都不会生效，因为共享 id 全部由插件副本胜出。

## 决策

- **删除 `apps/desktop/config/agent-presets/code`。** 它是 `ptc` 改名前的副本，不是 fork 的功能；`ptc` 才是插件、名册与选择器现在共用的 id。
- **把插件的 preset 镜像进桌面根**，两侧四个 id 与字节完全一致：`standard`、`ptc`、`minimal`、`cordis`（含 `cordis` 随行的两个 skill 与 `SKILL.md` 措辞）。桌面副本只是落后于上游，并非有意不同 —— 桌面壳等于 Web profile 加一层传输 overlay，Web 名册给得起的能力桌面也该有（`command-goal`、子代理模型选择、网页 `fetch`）。
- **让桌面根成为唯一的 `system` 根**：host boot overlay 在 `roots` 之外显式设置 `includeShippedRoot: false`。只有一个根，名册就退化成一次目录列举，没有遮蔽规则要推理，也不会有一个 id 以两个名字出现。它还让开发与打包两份名册一致：`config/agent-presets` 是 `electron-builder.yml` 里 `files` 的显式条目，而插件的 `presets/` 只能靠依赖收集进入打包应用，目前没有任何桌面门禁对其断言。
- **在 parity 测试中断言这层镜像**：`composition-parity.spec.ts` 现在逐文件比对两个目录，并拒绝两个 preset 发布同一个显示名；`apps/desktop/tests/host.spec.ts` 断言只有一个 `system` 根。上游新增或重命名 preset 会在桌面边界上让测试失败，而不是发出一份把同一能力列两遍、或者干脆漏掉它的名册。

保留桌面根而不是删掉它改用插件自带的：打包应用的依赖闭包是手工维护的（`scripts/sync-pack-deps.mjs`），打包启动探针也不检查 preset，让会话创建去依赖 `node_modules/@deepseek-ai/dsh-agent-presets/presets`，等于把一个可见的重复换成一份静默为空的名册。

## 测试

- `packages/bundle/sdkwork-desktop-app/tests/composition-parity.spec.ts` —— 6 项通过，含新增的镜像检查。
- `packages/preset/agent-presets/tests/shipped-root.spec.ts` —— 4 项通过（插件自带的根未改动）。
- `apps/desktop/tests/host.spec.ts` —— 新增断言：组装出的名册只带一个 `system` 根。
- 一次临时发现流程（对 `apps/desktop/config/agent-presets` 取桌面包的依赖闭包）打印出四个健康 preset —— `standard`（标准模式）、`ptc`（PTC 模式）、`minimal`（极简模式）、`cordis`（创造模式），无 `broken`，随后该临时测试已删除。

## 后续

`apps/desktop/release-build/` 是一份过期的解包产物，里面仍是旧的 `code` 目录；它被 gitignore，下一次 `electron-builder` 运行会覆盖。
