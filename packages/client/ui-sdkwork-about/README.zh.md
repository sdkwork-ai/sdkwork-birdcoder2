---
description: "SDKWork 关于 plugin：设置页与桌面对话框共用的一张产品页——产品标识、构建版本、安装实例已注册的 App ID，以及 BirdCoder2 App API 依据部署访问令牌解析出的应用信息。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-about

[English](README.md) | 中文

## 摘要

SDKWork 关于 plugin：一个设置页（id `about`，order `1000`，排在所有功能页之后）与一个 `shell.overlay` 对话框渲染同一张产品页——BirdCoder 产品标识、客户端构建版本、安装实例已注册的 App ID、平台校验后的部署身份，以及产品链接。桌面应用菜单的“关于”通过 `ctx.about` 服务打开该对话框，因此原生菜单与设置页呈现同一套关于设计。安装信息读取走 `GET /app/v3/api/installation`，经由生成的 `@sdkwork/birdcoder2-app-sdk` 客户端，以 ui-sdkwork-env 配置中的公开应用访问令牌鉴权。

## 目录

- [界面](#surface)
- [数据](#data)
- [安装身份](#installation-identity)
- [桌面关于命令](#desktop-about-command)
- [实现说明](#implementation-notes)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

## 界面

插件注册一个 `settings.section`、一个 `shell.overlay` 对话框，以及 `ctx.about` 服务：

- **导航行“关于”**（`settings.section`，id `about`，order `1000`）：设置面板的最后一项。`ui-sdkwork-settings-menu` 为该已知 id 绘制信息图标。
- **页面主体**：头部（产品标识、产品名、版本胶囊、标语、平台读取状态、刷新操作）、应用信息卡（版本、已注册 App ID、产品标识、供应商）、部署信息卡（运行环境、部署模式、归属范围、租户、组织级安装时的组织、服务地址、提交）、链接卡（官网、支持、隐私政策、服务条款）以及版权行。版本、App ID、服务地址与提交旁提供复制按钮。
- **对话框**：同样的内容以紧凑排版呈现，挂载到 document body，可通过关闭按钮、遮罩点击、Escape 或确认操作关闭。

## 数据

本地信息来自客户端构建（`DSH_CLIENT_VERSION`、`DSH_CLIENT_COMMIT_HASH`、`DSH_CLIENT_GIT_DIRTY`）与 ui-sdkwork-env 配置（声明的 App ID、产品标识、网关地址、运行环境、访问令牌）。平台读取返回安装实例的部署应用锚点、租户、组织范围、归属范围、生命周期环境、部署模式，以及安装时固化的产品信息；`decodeInstallationApplication` 在组件读取前重新校验该网络响应。

运行时把两份快照都持有为稳定可观察值。刷新期间已确定的信息保持显示；读取失败或响应不完整时渲染本地化提示，技术详情折叠在“技术详情”中，本地信息仍然可见。

## 安装身份

访问令牌指向安装实例：平台校验凭据并解析 `WebRequestContext`，路由投影这一已校验身份，而不是信任客户端自报的 App ID。因此关于页展示的已注册 App ID 来自响应，而不来自设置文档。未携带令牌的部署（仅 IAM 会话登录）渲染“未配置访问令牌”提示，而不是猜测。

## 桌面关于命令

`apps/desktop/src/about-command.ts` 持有 `sdkwork:about:open` / `sdkwork:about:takePending` 通道；`iam-preload.ts` 将它们暴露在 `window.sdkworkDesktop.about` 下。应用菜单项执行 `aboutCommand.show()`，聚焦工作区窗口并广播命令；若点击发生在页面监听之前，命令保持待处理，并在插件挂载时被消费一次。

## 实现说明

- 插件以 `env` Cordis 服务为前置（`inject`），缺少 `ui-sdkwork-env` 的组合会让插件保持 pending，而不是读取未配置的地址。
- SDK 客户端在 apply 闭包中构建，组件中从不构建；响应在网络边界收窄，组件通过注入面接收纯数据。
- 对话框可见性保存在 apply 中一次性创建的声明式 store 中，因此服务与渲染出的对话框不会不一致。

## 模型体验

无。关于界面是浏览器侧的产品身份展示，既不组装也不发送模型请求。

#### KV Cache 影响

无；该包既不组装也不发送提供商请求。

## 已知限制与后续工作

- **仅支持静态公开令牌** —— 读取使用部署配置中的静态访问令牌；仅 IAM 会话登录的启动没有可用令牌，会显示未配置提示。通过用户会话读取安装信息需要该路由当前尚未发布的鉴权应用接口。
- **对话框不提供更新操作** —— 检查更新仍由设置菜单与桌面上游器自己的界面承担，对话框刻意不重复该流程。
- **产品链接回退到随包标识** —— 平台尚未返回或无法访问时，链接卡展示随包 BirdCoder 目标地址，而不是隐藏该行。
