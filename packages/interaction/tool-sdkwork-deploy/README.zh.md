---
description: "面向模型的 sdkwork_deploy_app 工具：校验项目，把发布请求转交给已登录的 BirdCoder 客户端，并返回发布后的站点事实。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-sdkwork-deploy

[English](README.md) | 中文

## 概要

`sdkwork_deploy_app` 在对话中发布一个 SDKWork 应用。Host 只校验请求并把 `sdkwork-deploy/request` 作用域 waterfall 转交给已连接的 BirdCoder 客户端，因为发布需要已登录的 IAM 会话、项目文件以及生成的 deploy/drive 客户端——它们都在浏览器里。客户端打包构建产物、上传不可变制品、创建 release 与 deployment，并返回本工具输出的站点事实；客户端的对话卡片与右侧站点面板据此渲染。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与待办](#known-limitations-and-deferred-work)
- [开发者注记](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在具备 `tools` 服务的 Agent Cordis 组合中挂载它。`standard`、`ptc`、`cordis` 三个预设通过 Web 应用的预设补丁挂载。

模型调用 `sdkwork_deploy_app`，参数是持有 `agent.app.config.json` 的项目目录，可选相对该项目的构建产物目录、生命周期环境、语义版本与发布说明。工具会拒绝空白路径参数（`INVALID_ARGS`），要求存在 Agent Session（`TOOL_CONTEXT_UNAVAILABLE`），并在没有浏览器客户端应答时返回 `NO_CLIENT`（无头场景）。

返回的是“已报告的发布结果”，不是传输错误：`ok: false` 携带停止的阶段（`resolveProject`、`resolveApp`、`createApp`、`resolveBuildOutput`、`pack`、`uploadArchive`、`registerArtifact`、`createRelease`、`createDeployment`、`readSite`、`signedOut`、`unavailable`）、稳定错误码与可读说明。工具不会自行重试，因此模型报告阶段并只改变一件事。

成功返回 `ok: true` 与 `site`：应用身份与类型、规范 URL 与主机名、环境、版本、release 与 deployment 标识、发布后回读的 deployment 与应用状态、创建时间以及制品 package type。`ui-sdkwork-deploy` 把这些事实渲染为对话卡片，并在右侧 `sdkwork-deploy-site` 页签中打开。

<a id="understand-the-implementation"></a>
## 理解实现

本包是转交器，不实现部署：

1. `execute` 校验参数，并通过 `ctx.waterfall(scopeTarget(agent, agent), …)` 派发作用域 `sdkwork-deploy/request` waterfall。
2. `@deepseek-ai/dsh-api-remotes` 把该 waterfall 转发给携带同一 Agent 的浏览器客户端，由 `ui-sdkwork-deploy` 在完成发布后应答。
3. 工具把返回的站点事实格式化为模型可见文本，并返回卡片可收窄的结构化值。

`src/types.ts` 拥有跨包词汇：请求、站点事实、失败阶段，以及 Remote 白名单 import 的 `Events` 声明。`src/index.ts` 拥有工具定义、参数归一化与模型可见文本。

Host 不拥有任何发布状态：没有 session event、没有 projection、没有持久文件。客户端的发布与卡片是站点的唯一记录。

<a id="model-experience"></a>
## 模型体验

### sdkwork_deploy_app

#### 模型看到什么

schema 要求提供持有 `agent.app.config.json` 的项目目录，以及可选的构建产物目录、生命周期环境、语义版本与发布说明。描述说明已登录的 BirdCoder 客户端负责打包、上传与部署，并说明失败会指出停下的阶段。结果按事实逐行渲染：已发布的应用与环境、URL、release 与 deployment 状态；或者一行指出阶段、错误码与细节的失败信息。

#### Token 影响

每个已挂载 Agent 一个工具 schema，每次发布一段简短结果摘要。站点字节、构建产物与仪表盘记录从不进入模型消息。

#### KV Cache 影响

schema 与结果词汇在挂载生命周期内保持静态；一次发布结果扩展对话而不改写其提示前缀。

## 已知限制与待办

<a id="known-limitations-and-deferred-work"></a>


- 发布需要已连接且已登录 IAM 的浏览器客户端。无头或仅终端 Session 返回 `NO_CLIENT`；不存在 Host 侧凭据路径，因为部署 API 拒绝用公共应用 token 执行用户所属的写操作。
- 本工具不执行构建。模型或客户端的打包界面必须先产出构建产物；工具只发布已存在的目录。
- 发布状态只在 deployment 创建后回读一次。稍后完成的 deployment 在卡片中显示已受理状态；站点面板会重新读取。
- 原生移动端、小程序与桌面安装包仍需要各自的打包命令。工具发布清单描述的平台目标与制品；缺失的构建产物或平台目标会被报告，而不是猜测。

<a id="dev-note"></a>
### 开发者注记

转交存在的原因是 IAM 会话从不离开浏览器：`ui-sdkwork-deploy` 的 `DeployHost` 由会话与环境访问令牌派生双 token 客户端对，Host 工具无法自行发布。桥接在 Host 侧唯一需要的注册，就是 `@deepseek-ai/dsh-api-remotes` 中的 `sdkwork-deploy/request` 白名单行。
