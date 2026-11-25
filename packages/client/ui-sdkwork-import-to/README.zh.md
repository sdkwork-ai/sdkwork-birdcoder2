---
description: "SDKWork 中转站 API Key「导入到」插件（浏览器侧）：API Key 表格的悬停菜单列出 CC Switch 可链接导入的十六个编码工具（其应用清单去掉 CodeBuddy），每次点击按 CC Switch「点击使用」的写入语义生成该工具的实时配置，并提供 CC Switch 供应商链接与安装命令。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-import-to

[English](README.md) | 中文

## 摘要


SDKWork 中转站 API Key「导入到」插件（浏览器侧）。CloudRouter 控制台的 API Key 表格用它提供的十六个工具（CC Switch 应用清单去掉 CodeBuddy）替换原有三行（Birdcoder、CC Switch、DeepSeek Harness）；点中一行先确认 Key 名称、脱敏值与目标工具，确认后才通过审计接口取明文。

随后弹窗列出 CC Switch 激活供应商卡片时写入的完整文件，并提供逐文件复制/下载、安装命令与 `ccswitch://v1/import?...&enabled=true` 链接。

## 目录

- [职责范围](#what-it-owns)
- [接入方式](#how-it-integrates)
- [构建](#build)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

<a id="what-it-owns"></a>
## 职责范围

- **菜单目录**（`src/client/targets.ts`）：按 CC Switch 选择器顺序排列的十六个应用 —— Claude Code、Claude Desktop、Codex、Gemini CLI、Grok Build、OpenCode、OpenClaw、Hermes、Pi、MiniMax Code、Kimi Code、DeepSeek Harness、Antigravity、Oh My Pi、Copilot CLI、WorkBuddy —— 每项带两字母徽标、可接受协议、默认协议、是否必须填模型，以及生效方式是重开终端还是重启应用。
- **逐工具投影**（`src/client/ccSwitch/builders/`）：每个工具一个 builder，复刻 CC Switch `deeplink/provider.rs` 的 settings 及其对应的实时配置写入器。Claude Code 往 `~/.claude/settings.json` 写 `env.ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_MODEL`；Claude Desktop 在 `Claude-3p` 配置库注册网关 profile（profile id 归本插件所有）；Codex 写 `config.toml`（`model_provider = "custom"`，wire API 随协议）与 `auth.json`；Gemini CLI 写 `.env` 与 `settings.json`；Grok Build、OpenCode、OpenClaw、Hermes、Pi、MiniMax Code、Kimi Code、DeepSeek Harness、Oh My Pi、Copilot CLI、WorkBuddy 各自使用自己的文件与字段；Antigravity 没有全局设置文件，因此给一个私有 `--gemini_dir` 配置目录加带环境变量的启动命令。
- **供应商链接**（`src/client/ccSwitch/deeplink.ts`）：`ccswitch://v1/import?resource=provider&app=<id>&name=…&endpoint=…&apiKey=…&model=…&apiFormat=…&enabled=true`，与 CC Switch 自身「点击使用」采用同一契约。
- **安装命令**（`src/client/ccSwitch/script.ts`）：PowerShell 或 POSIX 程序，文件缺失时创建、插件自有文档替换前备份、合并类文件在已存在时把片段写到 `<path>.birdcoder-import` 而不是覆盖用户文件；不会静默替换任何已有实时配置。
- **导入弹窗**（`src/client/dialog/`）：源 Key 的名称与脱敏值、供应商名称/模型/协议表单，每个文件一张卡片（路径、写入方式、托管键、内容、可选合并片段、复制/下载），以及 CC Switch 链接、安装命令与 Antigravity 启动命令。
- **跨 bundle 接缝**（`src/client/extension.tsx`）：菜单行与选择回调以 `Symbol.for('sdkwork.cloudrouter.quick-import-extension')` 发布在 `globalThis`，因为控制台包与本插件是两个独立客户端 bundle，模块状态不共享。

<a id="how-it-integrates"></a>
## 接入方式

CloudRouter 控制台包（`sdkwork-cloudrouter-pc-console-api-keys`）在每次渲染时通过 `getQuickImportExtension()` 读取该注册槽。槽为空时菜单保持原有三行与原有弹窗；本插件注册后菜单渲染十六行，点中的行先由控制台弹出确认弹窗，确认后才取该 Key 的明文并把绝对网关端点一并转给 `onSelect({ targetId, key, endpoints, homepage })`。菜单、锚点几何、悬停定时器与取明文仍归控制台所有；行、弹窗与投影归本插件所有。

`packages/bundle/web-app` 把该行挂在 `ui-sdkwork-apikey` 旁边，因此 BirdCoder 出厂构建无需安装步骤即可提供十六个工具；没有该行的组合保持原状。

<a id="build"></a>
## 构建

```sh
pnpm --filter @deepseek-ai/dsh-client-ui-sdkwork-import-to bundle
```

<a id="model-experience"></a>
## 模型体验

无，因为本插件只把用户已在 API Key 表格中看到的 key 投影成本地工具配置文件与 CC Switch 供应商链接；它不注册任何工具、提示词段或会话事件。

#### KV Cache effect

不适用：本包没有任何内容进入模型请求，因此不会改变已缓存的提示词前缀。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- **不直接写文件系统。** 浏览器客户端没有宿主文件系统服务，因此「导入到」产出的是精确文件内容加安装命令，本身不会改写 `~/.claude/settings.json` 等实时配置；已装 CC Switch 的用户可以改用链接，由其应用完成写入。
- **依赖磁盘状态的变体靠说明而非探测。** `opencode.jsonc` 优先于 `opencode.json`、`models.yaml` 优先于 `models.yml`、`$CLAUDE_CONFIG_DIR` / `$CODEX_HOME` 覆盖，以及 DeepSeek Harness 可选的 `headless` / `acp` profile，都在文件卡片或计划说明里标注；浏览器弹窗无法读盘选择另一条路径。
- **Claude Desktop 的 profile 身份。** 网关 profile id 归本插件所有（`00000000-0000-4000-8000-0000000b17c0`），所以在本地导入与在 CC Switch 导入会得到两个 profile，而不是互相覆盖。
- **Kimi 的模型联动。** 导入始终把 `default_model` 指向导入的模型（与 CC Switch 的切换语义一致）；想保留原默认模型的用户删掉那一行即可。
