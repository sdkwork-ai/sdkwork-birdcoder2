# Agent Note: 关于界面从 App API 读取安装身份

Status: implemented

[English](2026-11-21-about-installation-identity.md) | 中文

## 问题

桌面壳的“关于”入口只弹出一个原生消息框，显示产品名与可执行文件版本；设置弹窗则完全没有关于页。两者都回答不了关于面板存在的意义：这是什么应用、我的访问令牌属于哪个安装实例、安装时固化了哪一份产品身份。客户端已经持有部署配置（`ui-sdkwork-env`：网关地址、公开应用访问令牌、声明的 App ID），平台会在服务端校验该令牌，但没有任何 App API 操作发布校验后的安装身份。在浏览器里解码令牌并信任其声明来展示，会让页面与网关实际接受的内容不一致。

## 决定

关于界面是一张产品页、两种呈现：`ui-sdkwork-settings-menu` 内的 `settings.section`（id `about`，order `1000`，排在所有功能页之后），以及桌面应用菜单“关于”通过新增 `ctx.about` 服务打开的 `shell.overlay` 对话框。两者渲染同一个 `AboutContent`，设置页与应用菜单不会演变成两套设计。

身份来自新的 App API 读取：`GET /app/v3/api/installation`（`installation.retrieve`，双令牌、不额外要求权限）。两个独立 crate 拥有它：`sdkwork-birdcoder2-installation-service` 承载领域投影（从签名声明或其旧式推导解析出的归属范围、生命周期环境、部署模式，以及产品切片），`sdkwork-routes-birdcoder2-installation-app-api` 把已校验的 `WebRequestContext` 投影到该领域与平台信封。产品档案由装配方提供配置；随包默认值是 `agent.app.config.json` 的 BirdCoder 身份。

生成的 TypeScript 传输层（`sdks/sdkwork-birdcoder2-app-sdk`）由规范生成器依据更新后的 OpenAPI 权威产出该操作。`ui-sdkwork-about` 在 apply 闭包中用 `ui-sdkwork-env` 配置构建该客户端，在网络边界重新校验响应，并在读取无法完成时展示本地信息、提示与重试。

桌面关于命令迁移到 `apps/desktop/src/about-command.ts`：`sdkwork:about:open` 向渲染进程广播命令，`sdkwork:about:takePending` 让点击之后才挂载的页面消费一次。`iam-preload.ts` 把两者暴露在既有 `window.sdkworkDesktop` 桥下，桌面壳因此只增加一个切片，而不是第二套桥。

## 备选方案

**独立的 Electron 关于窗口。** 它需要自己的 HTML/CSS/JS、自己的文案字典，以及自己访问部署令牌——而主进程并不持有令牌，页面三样都已有。应用内对话框还让设置页与菜单入口共用一条渲染路径。

**在浏览器中从访问令牌读取身份。** 令牌声明对页面可见，但客户端解码无法得知网关是否接受了该凭据，还会重复归属范围推导及其旧式回退。路由读取已校验上下文。

**把路由并入 `sdkwork-routes-birdcoder2-app-api`。** 该接口本就存在，但安装身份是一个具有独立服务的独立能力；单独一对 crate 让个人域的中继演进时无需触碰关于的契约，API 装配同时挂载两者。

## 影响

关于页现在可以展示权威的已注册 App ID，因为它是平台解析出来的，并且会诚实降级：仅 IAM 会话登录的启动没有静态令牌时会说明这一点，而不是猜测。代价是多一个路由 crate、装配对安装服务的依赖，以及内联生成 SDK 的客户端包（未压缩约 139 kB，含 `@sdkwork/sdk-common`）。

关于对话框不再以任何平台的原生面板形式存在；macOS 仍为系统级关于界面保留 `setAboutPanelOptions`，但应用菜单指向该页面。未来若安装身份需要超出产品切片的信息，扩展服务 crate 与 OpenAPI 权威、重新生成 SDK 即可，关于页面会接入新字段——它永远不会出现第二个 App ID 来源。
