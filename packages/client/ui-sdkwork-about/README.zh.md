---
description: "SDKWork 关于 plugin：设置页与桌面对话框共用的一张产品页——产品标识、构建版本、安装实例已注册的 App ID，以及 BirdCoder2 App API 依据已登录会话凭据解析出的应用信息。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-about

[English](README.md) | 中文

## 概述

SDKWork 关于 plugin：一个设置页（id `about`，order `1000`，排在所有功能页之后）与一个 `shell.overlay` 对话框渲染同一张产品页——BirdCoder 产品标识、客户端构建版本、安装实例已注册的 App ID、平台校验后的部署身份，以及产品链接。桌面应用菜单的“关于”通过 `ctx.about` 服务打开该对话框，因此原生菜单与设置页呈现同一套关于设计。安装信息读取走 `GET /app/v3/api/installation`，经由生成的 `@sdkwork/birdcoder2-app-sdk` 客户端，以已登录 IAM 会话的 `authToken`/`accessToken` 双令牌鉴权。

## 目录

- [界面](#surface)
- [数据](#data)
- [安装身份](#installation-identity)
- [桌面关于命令](#desktop-about-command)
- [实现说明](#implementation-notes)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

<a id="surface"></a>
## 界面

插件注册一个 `settings.section`、一个 `shell.overlay` 对话框，以及 `ctx.about` 服务：

- **导航行“关于”**（`settings.section`，id `about`，order `1000`）：设置面板的最后一项。`ui-sdkwork-settings-menu` 为该已知 id 绘制信息图标。
- **页面主体**：头部（产品标识、产品名、版本胶囊、标语、平台读取状态、刷新操作）、应用信息卡（版本、已注册 App ID、产品标识、供应商）、部署信息卡（应用方式、部署应用 ID、运行环境、部署模式、归属范围、租户、组织级安装时的组织、服务地址、提交）、链接卡（官网、支持、隐私政策、服务条款）以及版权行。版本、两个 App ID、服务地址与提交旁提供复制按钮。
- **对话框**：同样的内容以紧凑排版呈现，挂载到 document body，可通过关闭按钮、遮罩点击、Escape 或确认操作关闭。

<a id="data"></a>
## 数据

本地信息来自客户端构建（`DSH_CLIENT_VERSION`、`DSH_CLIENT_COMMIT_HASH`、`DSH_CLIENT_GIT_DIRTY`）、ui-sdkwork-env 配置（网关地址、运行环境、声明的部署锚点）、桌面 preload 桥是否存在（应用方式：桌面或网页），以及客户端构建未携带版本时经 About facts 桥取得的桌面外壳已安装版本。平台读取返回安装实例的部署应用 id、租户、组织范围、归属范围、生命周期环境、部署模式，以及安装时固化的产品信息；`decodeInstallationApplication` 在组件读取前重新校验该网络响应。

“已注册 App ID”一行只展示平台返回值。本地令牌声明或构建的部署锚点绝不暂代，读取中显示忙碌行，未返回时显示“未获取”。未登录的启动没有可用的凭据对，因此界面显示登录提示而不是猜测。供应商与产品标识回退到随包身份（`SDKWORK`、`sdkwork-birdcoder2`），因为它们描述的是已发布产品而不是安装实例。

运行时把两份快照都持有为稳定可观察值。刷新期间已确定的信息保持显示；读取失败或响应不完整时渲染本地化提示，技术详情折叠在“技术详情”中，本地信息仍然可见。

<a id="installation-identity"></a>
## 安装身份

已登录会话凭据指向安装实例：平台校验双令牌并解析 `WebRequestContext`，路由投影这一已校验身份，而不是信任客户端自报的 App ID。因此关于页展示的已注册 App ID 来自响应，而不来自设置文档或本地令牌解码。

每种应用方式注册各自的部署应用（仓库 `.env` 为每个 surface 记录锚点，打包流水线注入对应的 `SDKWORK_DEPLOY_APPLICATION_ID`）。页面构建把该锚点物化为 `SDKWORK_APP_ID`，`ui-sdkwork-env` 将其投影到 profile 的 `appId`，关于页在“应用方式”一行报告当前方式。平台按租户、属主与应用的组合保持一条安装实例（其部署应用 id 唯一），因此已校验响应始终指向那一个已创建的安装实例。未登录的启动显示登录提示；状态胶囊区分平台返回值与本地信息。

<a id="desktop-about-command"></a>
## 桌面关于命令

`apps/desktop/src/about-command.ts` 持有 `sdkwork:about:open` / `sdkwork:about:takePending` 通道；`iam-preload.ts` 将它们暴露在 `window.sdkworkDesktop.about` 下。应用菜单项执行 `aboutCommand.show()`，聚焦工作区窗口并广播命令；若点击发生在页面监听之前，命令保持待处理，并在插件挂载时被消费一次。

<a id="implementation-notes"></a>
## 实现说明

- 插件以 `env` 与 `iam` Cordis 服务为前置（`inject`），缺少 `ui-sdkwork-env` 或 `ui-sdkwork-iam` 的组合会让插件保持 pending，而不是读取未配置的地址或未登录的会话。
- SDK 客户端在 apply 闭包中构建，组件中从不构建；响应在网络边界收窄，组件通过注入面接收纯数据。
- 对话框可见性保存在 apply 中一次性创建的声明式 store 中，因此服务与渲染出的对话框不会不一致。

<a id="dev-note"></a>

## 开发备注

安装信息读取是唯一网络调用；插件只渲染已核验的安装身份，从不在浏览器缓存部署事实。

<a id="model-experience"></a>
## Model Experience

无。关于界面是浏览器侧的产品身份展示，既不组装也不发送模型请求。

#### KV Cache effect

无；该包既不组装也不发送提供商请求。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- **仅支持登录后读取** —— 读取使用 IAM 会话的凭据对；未登录的启动没有可鉴权凭据，会显示登录提示。
- **App ID 的新鲜度取决于平台** —— 平台返回之前关于页无法展示已注册 App ID，本地部署锚点只作为部署事实，不作为替代值。
- **对话框不提供更新操作** —— 检查更新仍由设置菜单与桌面上游器自己的界面承担，对话框刻意不重复该流程。
- **产品链接回退到随包标识** —— 平台尚未返回或无法访问时，链接卡展示随包 BirdCoder 目标地址，而不是隐藏该行。
