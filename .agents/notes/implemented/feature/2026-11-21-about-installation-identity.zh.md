# Agent Note: 关于界面从 App API 读取安装身份

Status: implemented

[English](2026-11-21-about-installation-identity.md) | 中文

## 问题

桌面壳的“关于”入口只弹出一个原生消息框，显示产品名与可执行文件版本；设置弹窗则完全没有关于页。两者都回答不了关于面板存在的意义：这是什么应用、我的访问令牌属于哪个安装实例、安装时固化了哪一份产品身份。客户端已经持有部署配置（`ui-sdkwork-env`：网关地址、公开应用访问令牌、声明的 App ID），平台会在服务端校验该令牌，但没有任何 App API 操作发布校验后的安装身份。在浏览器里计算并信任其声明作为答案，会让页面与网关实际接受的内容不一致。

## 决定

关于界面是一张产品页、两种呈现：`ui-sdkwork-settings-menu` 内的 `settings.section`（id `about`，order `1000`，排在所有功能页之后），以及桌面应用菜单“关于”通过新增 `ctx.about` 服务打开的 `shell.overlay` 对话框。两者渲染同一个 `AboutContent`，设置页与应用菜单不会演变成两套设计。

身份来自新的 App API 读取：`GET /app/v3/api/installation`（`installation.retrieve`，双令牌、不额外要求权限）。两个独立 crate 拥有它：`sdkwork-birdcoder2-installation-service` 承载领域投影（从签名声明或其旧式推导解析出的归属范围、生命周期环境、部署模式，以及产品切片），`sdkwork-routes-birdcoder2-installation-app-api` 把已校验的 `WebRequestContext` 投影到该领域与平台信封。产品档案由装配方提供配置；随包默认值是 `agent.app.config.json` 的 BirdCoder 身份。

生成的 TypeScript 传输层（`sdks/sdkwork-birdcoder2-app-sdk`）由规范生成器依据更新后的 OpenAPI 权威产出该操作。`ui-sdkwork-about` 在 apply 闭包中用已登录 IAM 会话凭据构建该客户端，在网络边界重新校验响应，并在读取无法完成时展示本地信息、提示与重试。

每一种应用方式注册各自的部署应用，构建把该方式的锚点物化为 `SDKWORK_APP_ID`；`ui-sdkwork-env` 将其投影到 profile 的 `appId`，使客户端命名的安装实例与页面构建所选一致。关于页使用已登录 IAM 会话的 `authToken`/`accessToken` 双令牌读取，这正是 app-api 期望的凭据组合，平台会先校验两半再作答。“已注册 App ID”一行只展示平台返回值：构建锚点与本地令牌声明都只是部署事实，读取中显示忙碌行，不可达或未登录时显示“未获取”。供应商与产品标识回退到随包身份（`SDKWORK`、`sdkwork-birdcoder2`）。客户端构建未携带版本时，经轻量的 About facts 桥取桌面外壳已安装版本。

桌面关于命令迁移到 `apps/desktop/src/about-command.ts`：`sdkwork:about:open` 向渲染进程广播命令，`sdkwork:about:takePending` 让点击之后才挂载的页面消费一次。`iam-preload.ts` 把两者暴露在既有 `window.sdkworkDesktop` 桥下，桌面壳因此只增加一个切片，而不是第二套桥。

## 备选方案

**独立的 Electron 关于窗口。** 它需要自己的 HTML/CSS/JS、自己的文案字典，以及自己访问部署令牌——而主进程并不持有令牌，页面三样都已有。应用内对话框还让设置页与菜单入口共用一条渲染路径。

**把访问令牌的声明当作权威身份。** 客户端解码无法得知网关是否接受过该凭据，还会重复归属范围推导及其旧式回退。因此关于页只在平台校验双令牌之后读取，只有响应解码器认可的词表才会成为已注册 App ID；本地解码声明永远不会。

**把路由并入 `sdkwork-routes-birdcoder2-app-api`。** 该接口本就存在，但安装身份是一个具有独立服务的独立能力；单独一对 crate 让个人域的中继演进时无需触碰关于的契约，API 装配同时挂载两者。

## 影响

关于页现在可以展示权威的已注册 App ID，因为它是平台依据已登录会话解析出来的，并诚实降级：未登录的启动没有凭据对时会说明这一点，而不是猜测或展示本地锚点。代价是多一个路由 crate、装配对安装服务的依赖，以及内联生成 SDK 的客户端包（未压缩约 139 kB，含 `@sdkwork/sdk-common`）。

该读取现在依赖 IAM 会话：未登录时该行保持“未获取”，app-api 未发布的部署会显示失败提示。已注册 id 是每个租户、属主与应用组合下唯一的那一个已创建安装实例——平台中部署应用 id 唯一——因此已校验响应绝不会指向别的安装实例。产品链接打开 `www.birdcoder.com` 站点；支持、隐私政策与服务条款位于 `/docs/` 下，文档服务会在启动时为新安装初始化租户 100001 的对应页面，因此 `/docs/{slug}` 在安装后无需运营方发布即可解析。

按模式的标识依赖打包流水线导出该模式的锚点：桌面打包会导出，而源码 `desktop:dev` 启动在平台返回之前报告构建的网页锚点。用户设置文档仍可覆盖 profile 并固定旧 app id——环境投影是部署默认值，不是强制身份。

关于对话框不再以任何平台的原生面板形式存在；macOS 仍为系统级关于界面保留 `setAboutPanelOptions`，但应用菜单指向该页面。未来若安装身份需要超出产品切片的信息，扩展服务 crate 与 OpenAPI 权威、重新生成 SDK 即可，关于页面会接入新字段——它永远不会出现第二个 App ID 来源。
