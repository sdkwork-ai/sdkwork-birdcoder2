---
description: "SDKWork 语音模型配置：ui-sdkwork-voice-models 设置页，用于配置官方厂商直连与中转站（每个服务商各自的 Base URL、协议、密钥来源与模型清单），并由宿主半边把该设置段投影为 voice-models.sdkwork.json 供技能读取。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-voice-models

[English](README.md) | 中文

## 概述

一个设置页——「语音模型」——掌管*语音合成与转写可以调用到哪里*：sdkwork-models 目录已收录的语音官方厂商，以及用户用自有 Base URL 指过来的任意数量中转站。每个服务商行都带有自己的 Base URL、协议、区域、密钥来源与模型清单，因此「同一语音模型经由厂商」与「经由中转站」是两行互不查询的独立配置。初始行来自目录本身：每个厂商带上传其目录公布的 API 根地址与该厂商全部语音模型，默认停用且无密钥，直到用户提供凭据。

该设置段还会被投影成一个文件——宿主 home 下 `sdkwork` 目录中的 `voice-models.sdkwork.json`——因为技能无法读取设置文档。该文件正是本设置段对外可读的形态：启动时与每次提交被接受后重写，从不手工编辑，也从不构成第二个权威。

## 目录

- [对外表面](#surface)
- [配置](#configuration)
  - [`voice-models.sdkwork.json` 文档](#the-voice-modelssdkworkjson-document)
  - [服务商、中转站与密钥](#providers-relays-and-credentials)
  - [预设数据从何而来](#where-the-presets-come-from)
- [Model Experience](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

## 对外表面

两处贡献，正好对应本功能跨越的两层：

- **语音模型页** —— 浏览器半边注册一个 `settings.section`（id 为 `voice-models`，order 22，标题取自本包字典），由设置外壳渲染在内容列，并补上外壳并不知情的导航行。该页列出服务商卡片；每张卡片把文本字段与模型暂存在本地草稿中并在「保存」时提交，而含义唯一明确的开关（启用服务商、设为默认、投影密钥）立即提交。
- **设置段与投影** —— 宿主半边把持久化的 `ui-sdkwork-voice-models` 设置段声明为自己的 `Config`，因此设置服务无需任何 `register` 调用即可提供它，同时写出 `.sdkwork.` 文档。写入是原子的（同目录临时文件改名覆盖目标）并按插件实例串行；写入失败只记录日志，绝不让插件失败。

## 配置

| 字段 | 含义 |
|---|---|
| `providers` | 服务商行：官方厂商根地址与中转站，按页面顺序排列。 |
| `defaultProviderId` | 未指定服务商时语音合成或转写调用使用的行。为空表示第一个已启用的行。 |
| `writeSecrets` | 投影文档是否携带密钥原文。默认关闭。 |
| `directory` | 普通配置项而非表单字段：投影写入目录。为空则跟随宿主 home（`$DSH_HOME`，其次 `~/.dsh`）下的 `sdkwork`。 |

每个服务商行为：

| 字段 | 含义 |
|---|---|
| `id` | 段内唯一且稳定的本地 id（`official-openai-global`、`relay-1`）。 |
| `label` | 显示名称；为空时显示 id。 |
| `kind` | `official`（目录厂商根地址）或 `relay`（中转站）。 |
| `vendor` / `region` | sdkwork-models 厂商代码与区域；中转站为空。 |
| `protocol` | Base URL 所讲协议（`openai_compatible`、`openai_responses`、`anthropic_messages`）；为空表示厂商自有协议。 |
| `baseUrl` | 每次调用所指向的 API 根地址。 |
| `apiKey` / `apiKeyEnv` | 粘贴的密钥原文，以及承载密钥的环境变量名；调用时 `apiKeyEnv` 优先。 |
| `enabled` | 是否允许语音合成与转写使用该行。 |
| `models` | 模型行：线缆 `id`、`displayName`、`catalogKey`、`enabled`，以及本模态的默认参数（`voiceId`、`format`、`speed`、`language`）。 |

每个模型行的默认值与 sdkwork-models 目录一致，因此播种出来的行与目录含义相同：

| 字段 | 含义 |
|---|---|
| `voiceId` | 目录记录的该模型音色绑定（`alloy`），即文转语请求所指定的标识；为空表示使用服务商自身默认。 |
| `format` | 请求返回的音频容器（`mp3`、`wav`）；为空表示使用服务商自身默认。 |
| `speed` | 语速倍率，取值 `0.25`–`4`、步进 `0.05`；服务商默认为 `1`。 |
| `language` | 朗读或转写所用语言的 BCP-47 标签（`zh-CN`），跟随绑定音色的 `primaryLocale`；为空表示使用音色自身默认。 |

### `voice-models.sdkwork.json` 文档

```json
{
  "schemaVersion": "1.0.0",
  "kind": "sdkwork.voice-models",
  "plugin": "ui-sdkwork-voice-models",
  "modality": "voice",
  "updatedAt": "2026-10-02T00:00:00.000Z",
  "defaultProviderId": "official-openai-global",
  "writeSecrets": false,
  "providers": [
    {
      "id": "official-openai-global",
      "label": "OpenAI",
      "kind": "official",
      "vendor": "openai",
      "protocol": "openai_compatible",
      "region": "global",
      "baseUrl": "https://api.openai.com/v1",
      "enabled": true,
      "credential": { "env": "OPENAI_API_KEY", "stored": true },
      "models": [
        {
          "id": "gpt-4o-mini-tts",
          "displayName": "GPT-4o mini TTS",
          "catalogKey": "openai/gpt-4o-mini-tts",
          "enabled": true,
          "voiceId": "alloy",
          "format": "mp3",
          "speed": 1,
          "language": "zh-CN"
        }
      ]
    }
  ]
}
```

读取方通过 `defaultProviderId` 或 `id` 选择服务商，按 `enabled` 过滤，并在 `credential.env` 非空时从该环境变量取密钥。只有在 `writeSecrets` 打开**且**确有密钥原文时才会出现 `credential.value`；设置文档始终是密钥必须存在的那一处，这也是默认不把密钥写入文件的原因。

### 服务商、中转站与密钥

两种 kind 的区别在于「知道什么」，而不在于「能做什么」。官方行由目录播种，告诉用户有哪些厂商、它们在哪里应答；中转站行从空白开始，存在的原因是同一模型往往还能经由某个拥有自有 Base URL、密钥与命名的站点访问。二者都不享有特权：都带 Base URL、协议与模型清单，因此一次部署可以完全经由中转站打通全部模型，而不触碰任何官方行。

密钥有两种可能来源，且该行同时保留两者。`apiKeyEnv` 命名一个环境变量并在调用时优先；`apiKey` 保存用户粘贴的原文。页面从不接收已保存的原文——它只显示「已配置」，未改动的字段保存为「保持原值」——因此一次设置往返不可能悄悄抹掉密钥。

### 预设数据从何而来

`src/model-presets.ts` 由同级仓库 `sdkwork-models` 目录生成：

```bash
node scripts/generate-sdkwork-model-presets.mjs
```

它读取每个厂商的 `vendor.json` 与模型文件，取每厂商规范的 `https://<host><pathPrefix>` 根地址，输出具备 voice 能力的厂商，以及所有主能力为 `audio` 的目录模型。目录升级后重新生成即可；该文件记录了生成所用的目录版本与时间。

## Model Experience

None, as the package configures where speech synthesis and transcription calls go and registers no prompt section, tool, or session event.

#### KV Cache effect

None directly: the file and the section are read by voice consumers, which own their own request prefixes.

## 已知限制与后续工作

- 本包不发起语音合成或转写调用：设置段与其投影都是配置，读取文件或设置段的消费方自行负责请求、重试与错误呈现。
- 投影在读取侧没有 schema 校验：手工改过的文件会在下一次提交时被整体覆盖，而不是被拒绝。

### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

**运行时不变量：** 不发布 companion。投影文档是活动设置段的纯函数——宿主在每次提交时重新读取配置引用——因此唯一可能漂移的事实是文件与设置段是否一致，而宿主测试同时断言了启动投影与「提交即重写」这两条保持二者相等的路径。手工改过的文件会在下一次写入时被纠正而不是被信任，因此不存在供 companion 拥有的第二权威。

四个模态页（图片、视频、语音、音乐）刻意做成互相独立的包。它们共享一种形状——带 Base URL 与密钥的服务商——但不共享运行时：每个包拥有自己模态的模型参数、自己的预设模块与自己的投影文件，因此其中一个可以独立改动而不必重新发布其余三个。

</details>
