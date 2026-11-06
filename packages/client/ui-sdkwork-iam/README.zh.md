---
description: "SDKWork IAM integration plugin: sign-in/register and sign-out through the sdkwork-iam auth stack, mounted as the account app mode, the settings-menu account seam, and a frame overlay modal host."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-iam

[English](README.md) | 中文

## 概述


SDKWork IAM 集成插件：通过 sdkwork-iam 认证栈提供登录/注册（全新页面与 Modal 弹窗两种形态）与退出登录，挂载为账号应用模式、设置菜单账号缝与框架浮层 Modal 宿主。

## 目录

- [表面](#surface)
- [配置](#configuration)
- [实现说明](#implementation-notes)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

## 表面

插件贡献三块 UI 表面与一个服务缝：

- **账号模式**（`mode.page` keyed `account`）。未登录时模式页挂载 sdkwork 全页认证表面（`SdkworkAuthPage`：密码、手机验证码、邮箱验证码登录与扫码，以及邮箱/手机注册 + 找回密码，跟随 `ui-sdkwork-iam` 设置的开关）；登录后显示账号摘要（显示名、用户名、用户 ID、邮箱）与退出按钮。未配置时页面以配置提示响亮失败。该模式从设置菜单的登录手势进入，不在模式栏中。
- **Modal 登录宿主**（`shell.overlay` 条目 `iam-sign-in`）：当 `presentation` 设置为 `modal` 时，设置菜单账号缝的登录手势打开的是产品登录入口——桌面欢迎窗与 Web 账号弹窗共用的 `LoginPanel`（品牌图标与文字标志、欢迎语、标语、“登录”、“添加 API Key”）。该入口自己的“登录”执行 `signInMethod` 配置的登录手势：出厂 `browser` 在系统浏览器中打开托管授权页，并显示等待深链回调的交接卡片（可重试）；`modal` 则在不离开应用的情况下唤起 `SdkworkSessionAuthLoginModal`，即账号登录方式表单（密码、手机验证码、邮箱验证码、扫码）。当“登录”走浏览器交接时，入口把该表单保留为操作列下方的安静链接“内置弹窗登录”，因此交接前的老登录方式对尚未完成 relying party 注册的租户仍只差一次点击；当“登录”本身就会唤起该表单时（配置为 `modal`，或页面没有桌面深链桥），链接不显示，入口不会重复自己。没有桌面深链桥的页面始终使用页面内表单。若调用方自己的界面已经展示过入口（桌面欢迎页，或其中以 `login` 结束的 API Key 页），同样执行配置的手势，入口不会连续出现两次。“添加 API Key”打开桌面壳的登录页，由其中的密钥表单写入凭据；纯浏览器页面没有该页面，且只有 OEM profile 设置 `brand.showApiKeyEntry: true` 时入口才显示这一选项。未配置 baseUrl 时打开的是配置提示，而不是认证表面。登录表面只由显式手势打开——该菜单行，或受门控模式页未登录提示（`AuthenticatedModeShell`）上的登录按钮。任何模式切换、提交或页面挂载都不会打开它：受门控页面就地说明自己的要求。宿主把对话框传送到文档 body 上、置于页面层叠的最顶层（z-index 1200，高于页面模态、commerce 弹窗、菜单与 toast），并恢复 Radix 对话框从同级节点夺走的输入与无障碍状态——body 上的 `pointer-events: none` 以及其它 body 子节点上的 `aria-hidden`——因此从自身模态内部发起登录的调用方能得到一个可操作的登录卡片，而不是被自己的模态盖住。
- **桌面端登录页**：当存在 `dshDesktop.auth.openSignIn` 桥时，`requestSignIn()`（即 `ctx.iam` 延迟登录要求的入口）会在运行中的工作区之上打开桌面壳的欢迎登录页，而不是直接弹出 Modal。`'login'` 随后执行上文配置的登录手势（默认浏览器交接），`'credential'` 表示用户改为保存了 API Key，`'dismissed'` 表示取消；该页面从不持有 Token，也不会重新加载工作区文档。纯浏览器页面直接打开页面内方式表单。
- **设置菜单账号缝**：插件通过 `ctx.account.setSource` 替换菜单的匿名账号源——未登录时展示登录/注册行（无需任何配置），已登录时发布显示身份并启用底栏退出。
- **`ctx.iam`**：IAM 服务面——基于生成的 `@sdkwork/iam-app-sdk` 客户端的 sdkwork 认证控制器、`ui-sdkwork-iam` 设置镜像、登录形态分发（Modal 或页面），账号画像的读写（`retrievePersona`、`updatePersona`）以及可选字典（`retrievePersonaCatalog`）；persona 选择弹窗复用同一个客户端、同一个 base URL 与同一个 TokenManager。

## 配置

IAM baseUrl 与租户应用 id 来自共享的 [ui-sdkwork-env](../ui-sdkwork-env/README.zh.md) profile——活动环境的 `apiBaseUrl` 即 IAM app-api 源、`appId` 即租户应用 id；`apiBaseUrl` 为空时关闭会话恢复与认证表面（菜单的登录/注册行仍然可见，点击打开配置提示）。OEM profile 中的 `sdkwork.iamBaseUrl` 非默认值时会在所有环境层级替换该源；生成的客户端仍使用相同的 `/app/v3/api/auth/...` 路径、相同参数与 `X-Platform: pc` 请求头，只有域名变化。

页面内的 sdkwork 认证表面位于产品登录入口之后，是它的账号登录方式表单。它提供 IAM 租户支持的账号登录方式——密码、手机验证码、邮箱验证码与扫码（`qrLoginEnabled` 设置，默认开启）——并通过共享 TokenStore 提交每一次成功登录，把双 Token 会话经 `sdkworkDesktop.iamSession` 桥镜像到 `<DSH_HOME>/iam/session.json`。后续启动会恢复该会话，因此已登录用户不再看到登录界面，触发登录的操作直接继续。

托管浏览器登录是桌面端出厂的登录手势，它要求租户应用完成 OAuth relying party 注册：`runtimeConfig.oauth.relyingParty` 中 `clientId: birdcoder`、`redirectUris: ["birdcoder://auth/callback"]`、`confidential: false`，以及 `openid profile email offline_access` scope。`agent.app.config.json` 已经声明了这一块，租户通过 PC 管理端的 relying party 界面或应用清单把它应用上去。未注册的租户会让 `<iamAuthorizeBaseUrl>/iam/oauth/authorize` 返回 `invalid_client`，而该页面在应用之外，工作区无法检测或修复它——这类部署在注册落地前应设置 `signInMethod: modal`。待处理流程有截止时间，浏览器端的授权或完成失败会通过同一个 deep link 回传（`error` + `error_description` + `state`），交接卡片因此能显示失败并重试，而不是一直等到超时。兑换会携带稳定的安装级 device id，新登录只替换该设备在同一应用下的旧会话：完成授权的浏览器会话和用户的其他设备保持登录。该流程依赖标准 `sdkworkDesktop` preload 桥（`deepLinks` / `shellOpen`）。待处理的 PKCE 流程持久化在渲染进程存储中（仅 verifier 与 state，兑换成功或过期即清除），因此浏览器登录在桌面应用退出后才完成时，deep link 重新拉起应用仍能完成登录；没有待处理流程的回调会被忽略，而不是报成登录失败。

兑换成功后走与页面内登录相同的收尾：完整会话（双 token、可轮换的 refreshToken、sessionId 与 AppContext）先写入持久存储，再发布到共享 TokenManager，随后用这份凭据读取账号资料补全身份（显示名、姓名、首字母、邮箱、用户名），最后交给认证控制器并排定预过期刷新。资料读取受预算约束且尽力而为——它失败或超时只让缓存身份退化为兑换返回的身份，不会把已经成功的登录报成失败。交接卡片的失败状态按运行时错误码指出失败环节（浏览器未批准、兑换失败、流程超时、回调无法校验、环境不支持等），不再把所有失败都说成“浏览器打不开”；失败状态同时给出“内置弹窗登录”，让租户的授权注册尚未就绪时也只差一次点击。冷启动兑换失败时，浮层一旦挂载就立即呈现该失败与恢复操作，而不是把用户留在没有任何解释的匿名工作区。

存储是凭据权威：预过期刷新轮换出的 token 会立刻替换共享 TokenManager 中的值，而只写 token 的会话写入会保留缓存身份与 AppContext，因此刷新不会让账号行在下次启动后变空，也不会让 SDK 继续使用即将过期的 access token。退出登录优先用 refresh token 在服务端撤销会话（access token 过期后仍然有效），随后清空本地副本与共享凭据。进行中的登录只在这条尝试已不再等待时才被判定失败：过期、伪造或重复的回调被忽略，卡片保持等待，真实回调仍可完成这次登录。

`ui-sdkwork-iam` 设置命名空间（host 侧注册在本包 node half，通过 api-proxy 的产品命名空间列表暴露给浏览器）只保留展示与登录开关：

| 字段 | 默认值 | 含义 |
|---|---|---|
| `presentation` | `modal` | 设置菜单登录的打开方式：Modal 或全页账号模式 |
| `signInMethod` | `browser` | 登录面板“登录”按钮的流程：系统浏览器中的托管登录页，或未完成 relying party 注册的租户使用的页面内表单（`modal`） |
| `qrLoginEnabled` | `true` | 认证表面是否提供扫码登录 |
| `oauthLoginEnabled` | `false` | 认证表面是否提供 OAuth 登录 |

会话持久化在桌面外壳的操作系统加密副本中（操作系统提供密钥库时使用 Electron `safeStorage`，位于 `<DSH_HOME>/iam/session.json`，仅属主可读、原子写入）；纯浏览器页面没有系统密钥库，使用 `localStorage` 的 `dsh.iam.session` 键。桌面端刻意不再把 token 镜像到 `localStorage`，旧的本地副本会迁移一次并删除。桌面副本包含完整会话（authToken、accessToken、可轮换的 refreshToken、sessionId、user 与 AppContext）；持久化写入失败的提交会被拒绝，不会把无法跨启动的登录报告为成功。验证码登录方式默认隐藏（harness 的 app 客户端不提供消息验证码 API）；在后端策略允许时注册与找回密码无需验证码，页面也遵循后端获取到的策略。

## 实现说明

- 运行时适配器（`iam-runtime.ts`）把 `SdkworkIamRuntimeAuthRuntimeLike` 表面映射到生成的 app 客户端（双 token 认证模式），并让客户端凭据状态与 localStorage token 存储保持同步。
- `@deepseek-ai/dsh-client-ui-sdkwork-iam/src/sdkwork-global-token-manager.ts` 持有浏览器全局 `AuthTokenManager`，供每个 SDKWork 客户端插件共享。IAM 登录会把合并后的 IAM 与环境凭证写入该 manager；Drive、Knowledge、Token Plan、Feedback 与 Agents 表面读取同一传输层，而不是各自创建隔离 manager。
- 认证表面是 sdkwork 组件；其 Tailwind 工具类来自 `apps/web` 的 Tailwind 管线（`@source` 指向 sdkwork 包，`primary-*` 别名到 harness 的 deepseek 品牌色阶）。浅色表单控件叠加 `--dsw-alias-bg-overlay` 与 `--dsw-alias-border-l2`，而不是浅色下塌成同一白色的 `bg-layer-*`；深色控件使用 `bg-layer-1` 对照 elevated shell。二维码列使用与 shell 相同的填充；白色画布外的框是透明的。叠加 CSS 以 CSS Module（`sdkwork-auth.module.css`）随客户端 bundle 注入。
- 本包的 tsc 发射把 `@sdkwork/*` 解析到本地声明门面（`sdkwork-types/`）——sdkwork 源码无法可移植地发射进 `lib/types`；针对真实包的完整类型检查在 `tsconfig.tests.json`（接入 `typecheck:contracts-ready`）中运行，是门面的漂移守卫。tsdown 客户端 bundle 换用无 paths 的 tsconfig 以内联私有认证与 i18n 源码包，把 qrcode 钉到浏览器入口（其 node 渲染器会把 `fs` 拖进浏览器 bundle），并清空 sdkwork 闭包中唯一一个普通样式表（一个本 harness 从不挂载的组件错误页 css）。发布包只声明公共的 `@sdkwork/iam-app-sdk@0.1.1` 可选依赖；npm 消费者不会解析私有源码包。

## 模型体验

无，因为本包是浏览器侧 SDKWork 登录与账号表面，其业务 HTTP 请求与 Harness 模型请求相互独立。

#### KV Cache effect

无；本包既不组装也不发送 provider 请求。

## 已知限制与后续工作

- **验证码登录**——邮箱/手机验证码登录与需要验证的注册依赖消息验证码 API；harness app 客户端未暴露它，因此这些方式被隐藏或呈现后端策略的要求。
- **扫码与 OAuth 登录**——默认关闭；启用需要后端特性与提供方目录。
- **浏览器登录需要租户完成 relying party 注册**——`signInMethod: browser` 打开租户托管授权页，在租户应用 `agent.app.config.json` 里的 `oauth.relyingParty`（`clientId: birdcoder`、`redirectUris: ["birdcoder://auth/callback"]`）被应用之前，该页会返回 `invalid_client`；浏览器显示该错误文档，而应用观察不到它，因此未应用该配置的租户应设置 `signInMethod: modal`。
- **单一个人会话**——组织/登录上下文选择挑战会呈现 sdkwork 对话框，但 harness 没有租户管理；多租户流程未经测试。

### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

`sdkwork-global-token-manager.ts` 持有每个 SDKWork 客户端插件共享的浏览器全局 `AuthTokenManager`——IAM 登录把合并后的 IAM 与环境凭证写入该 manager，Drive、Knowledge、Token Plan、Feedback 与 Agents 表面读取同一传输层，而不是各自创建隔离 manager。tsc emit 将 `@sdkwork/*` 解析到本地声明门面；针对真实包的 `tsconfig.tests.json` 类型检查是门面的漂移守卫。

</details>

## 运行时不变量

不发布运行时不变量伴随检查；account 接缝交换是一次服务调用（`ctx.account.setSource`），settings 菜单按原契约消费；IAM 会话事实经 sdkwork 控制器自己的状态机流转，认证界面通过标准 keyed slot 挂载；会话/展示一致性直接由本包的客户端行为规格测试覆盖。
