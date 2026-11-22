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

插件贡献以下表面与 `ctx.iam` 服务缝：

- **账号模式**（`mode.page` keyed `account`）。未登录时模式页挂载 sdkwork 全页认证表面（`SdkworkAuthPage`：密码、手机验证码、邮箱验证码登录与扫码，以及邮箱/手机注册 + 找回密码，跟随 `ui-sdkwork-iam` 设置的开关）；登录后显示账号摘要（显示名、用户名、用户 ID、邮箱）与退出按钮。未配置时页面以配置提示响亮失败。该模式从设置菜单的登录手势进入，不在模式栏中。
- **Modal 登录宿主**（`shell.overlay` 条目 `iam-sign-in`）：当 `presentation` 设置为 `modal` 时，设置菜单账号缝的登录手势打开的是产品登录入口——桌面欢迎窗与 Web 账号弹窗共用的 `LoginPanel`（品牌图标与文字标志、欢迎语、标语、“登录”、“添加 API Key”）。该入口自己的“登录”执行 `signInMethod` 配置的登录手势：出厂 `browser` 在系统浏览器中打开托管授权页，并显示等待深链回调的交接卡片（可重试）；等待期间卡片还会复制托管授权链接，让报告打开成功却没有显示窗口的浏览器也能完成登录；`modal` 则在不离开应用的情况下唤起 `SdkworkSessionAuthLoginModal`，即账号登录方式表单（密码、手机验证码、邮箱验证码、扫码）。当“登录”走浏览器交接时，入口把该表单保留为操作列下方的安静链接“内置弹窗登录”，因此交接前的老登录方式对尚未完成 relying party 注册的租户仍只差一次点击；当“登录”本身就会唤起该表单时（配置为 `modal`，或页面没有桌面深链桥），链接不显示，入口不会重复自己。没有桌面深链桥的页面始终使用页面内表单。若调用方自己的界面已经展示过入口（桌面欢迎页，或其中以 `login` 结束的 API Key 页），同样执行配置的手势，入口不会连续出现两次。“添加 API Key”打开桌面壳的登录页，由其中的密钥表单写入凭据；纯浏览器页面没有该页面，且只有 OEM profile 设置 `brand.showApiKeyEntry: true` 时入口才显示这一选项。未配置 baseUrl 时打开的是配置提示，而不是认证表面。登录表面只由显式手势打开——该菜单行，或受门控模式页未登录提示（`AuthenticatedModeShell`）上的登录按钮。任何模式切换、提交或页面挂载都不会打开它：受门控页面就地说明自己的要求。宿主把对话框传送到文档 body 上、置于页面层叠的最顶层（z-index 1200，高于页面模态、commerce 弹窗、菜单与 toast），并恢复 Radix 对话框从同级节点夺走的输入与无障碍状态——body 上的 `pointer-events: none` 以及其它 body 子节点上的 `aria-hidden`——因此从自身模态内部发起登录的调用方能得到一个可操作的登录卡片，而不是被自己的模态盖住。
- **桌面端登录页**：当存在 `dshDesktop.auth.openSignIn` 桥时，`requestSignIn()`（即 `ctx.iam` 延迟登录要求的入口）会在运行中的工作区之上打开桌面壳的欢迎登录页，而不是直接弹出 Modal。`'login'` 随后执行上文配置的登录手势（默认浏览器交接），`'credential'` 表示用户改为保存了 API Key，`'dismissed'` 表示取消；该页面从不持有 Token，也不会重新加载工作区文档。服务在该宿主挂载时取得 overlay store 绑定的动作，并通过它们呈现；因此在首次渲染之前记录的请求——启动交接或冷启动失败回调——会在挂载时补上交接或失败卡片。登录手势本身不等挂载：托管页才是登录表面，所以 overlay 尚未渲染（或始终不渲染）时，请求仍会启动浏览器登录，而不会落进尚未绑定的表面。页面内账号表单只存在于宿主内部，因此该手势会把请求留给挂载，而不是在没有可显示表面时把它消费掉。手势取自 IAM 设置命名空间，并带有两秒的有界等待：该请求在启动时执行，Host 设置文档未必已经到达，否则默认值可能为配置为页内表单的部署启动浏览器交接。纯浏览器页面直接打开页面内方式表单。
- **设置菜单账号缝**：插件通过 `ctx.account.setSource` 替换菜单的匿名账号源——未登录时展示登录/注册行（无需任何配置），已登录时发布显示身份并启用底栏退出；该退出会先请求确认，而不是第一次点击就结束会话。
- **退出登录确认宿主**（`shell.overlay` 条目 `iam-sign-out`）：所有退出登录手势共用的确认问题——设置菜单底栏行、账号模式的退出按钮，以及「个人主页」分区（`ui-sdkwork-profile`）。确认后在登录所用的托管认证 origin 上结束会话：桌面壳以 OAuth 公共客户端登录，因此经 shell 桥打开该客户端的 OAuth 注销（`<iamAuthorizeBaseUrl>/oauth/logout?client_id=<clientId>`）；页面本地会话（纯网页里的页面内账号表单）则在新标签页打开托管退出登录页（`<iamAuthorizeBaseUrl>/oauth/sign-out`）。两种情况浏览器到达的都是登录时的域名，不涉及任何产品门户。该弹窗是独立的 `shell.overlay` 条目（store `iam-sign-out`），避免结束会话继承登录 store 的步骤；它同样传送到 body，原因与登录宿主一致。
- **`ctx.iam` 的 profile 快照**：`profileSnapshot()` 以单一记忆化值发布已登录账号（昵称、邮箱、用户名、账号 ID、组织/租户 ID、个人或企业、环境、app id、管理中心 origin、登录 origin 上的退出登录 URL），供「个人主页」分区渲染。缓存以控制器状态加环境事实为键，因此分区的钩子在事实变化前观察到稳定引用。
- **`ctx.iam`**：IAM 服务面——基于生成的 `@sdkwork/iam-app-sdk` 客户端的 sdkwork 认证控制器、`ui-sdkwork-iam` 设置镜像、登录形态分发（Modal 或页面），账号画像的读写（`retrievePersona`、`updatePersona`）以及可选字典（`retrievePersonaCatalog`）；persona 选择弹窗复用同一个客户端、同一个 base URL 与同一个 TokenManager。
- **中转会话凭据镜像**：插件经 `remote.credentials` 把已登录的 `authToken` 写入 Host 凭据面的 `BIRDCODER_AUTH_TOKEN`，并在退出登录时移除。BirdCoder 中转接受该令牌作为 API Key，而浏览器启动没有桌面外壳在 `<DSH_HOME>/iam` 写的会话文件；缺了这次写入，浏览器里的登录会让每个中转请求都没有凭据。该引用只是会话来源，不是中转自己的 Key——Host 的 `birdcoder-account` 插件只在 `BIRDCODER_API_KEY` 上没有用户 Key 时才复制它，因此「模型」页填写的 API Key 始终优先。镜像挂在 `remote`/`remote.credentials` 服务上：没有这些服务的页面（欢迎窗口、无头组合）保留登录表面，只是跳过这次写入。
- **BirdCoder 提供方卡片提示**（`settings.models.provider-card`，keyed `llm-pi-ai`）：配置缺失的 BirdCoder 卡片上说明中转使用登录账号的 Auth Token，并提供登录手势，打开与设置菜单相同的登录表面。已登录或凭据关联（credential join）报告 Key 已配置时不渲染；它位于行上而不是编辑器内部，其他 pi-ai 路由完全不受影响。卡片自己的 API Key 输入框仍是覆盖路径，在没有「模型」分区的组合里也是唯一路径（该插槽不会被声明）。
- **Chat 失败行的凭据修复**（`conversation.chat.turn-error.sign-in` 与 `conversation.chat.turn-error.model-settings`）：缺少凭据的句子保留原有措辞，只把两个短语变成链接。**登录账号** 通过 `openSignInOverlay` 打开登录入口弹窗，已登录时该短语退回纯文本；**设置 → 模型** 经 `ctx.settingsMenu` 打开「模型」页并定位到 BirdCoder 提供方卡片、将该行滚入视野。标签来自 Chat 的本地化文案，因此整句仍是一句本地化文本；两个条目都只响应 `MISSING_CREDENTIAL`。

## 配置

IAM baseUrl 与租户应用 id 来自共享的 [ui-sdkwork-env](../ui-sdkwork-env/README.zh.md) profile——活动环境的 `apiBaseUrl` 即 IAM app-api 源、`appId` 即租户应用 id；`apiBaseUrl` 为空时关闭会话恢复与认证表面（菜单的登录/注册行仍然可见，点击打开配置提示）。OEM profile 中的 `sdkwork.iamBaseUrl` 非默认值时会在所有环境层级替换该源；生成的客户端仍使用相同的 `/app/v3/api/auth/...` 路径、相同参数与 `X-Platform: pc` 请求头，只有域名变化。

托管认证 origin——浏览器登录打开、所有会话结束 URL 所在的 origin——是 OEM profile 的 `sdkwork.iamAuthorizeBaseUrl`，生产环境出厂为 `https://platform.birdcoder.com`，其他环境为对应的 `platform-<tier>.birdcoder.com`。因此登录页与其 OAuth 会话结束端点由同一个值一起迁移；环境 profile 中的 CloudRouter 门户 origin 只为管理中心链接提供地址。会话结束端点属于 OAuth 组：`/oauth/logout`（按客户端限定，桌面会话）与 `/oauth/sign-out`（页面本地会话的退出登录页），两者都由 [`oauth-session.ts`](src/client/oauth-session.ts) 拥有。

页面内的 sdkwork 认证表面位于产品登录入口之后，是它的账号登录方式表单。它提供 IAM 租户支持的账号登录方式——密码、手机验证码、邮箱验证码与扫码（`qrLoginEnabled` 设置，默认开启）——并通过共享 TokenStore 提交每一次成功登录，把双 Token 会话经 `sdkworkDesktop.iamSession` 桥镜像到 `<DSH_HOME>/iam/session.json`。后续启动会恢复该会话，因此已登录用户不再看到登录界面，触发登录的操作直接继续。

托管浏览器登录是桌面端出厂的登录手势，它要求租户应用完成 OAuth relying party 注册：`runtimeConfig.oauth.relyingParty` 中 `clientId: birdcoder`、`redirectUris: ["birdcoder://auth/callback"]`、`confidential: false`，以及 `openid profile email offline_access` scope。`agent.app.config.json` 已经声明了这一块，租户通过 PC 管理端的 relying party 界面或应用清单把它应用上去。暴露回环监听的桌面壳改用 RFC 8252：每次登录以 `http://127.0.0.1:<临时端口>/auth/callback` 作为 `redirect_uri`，IAM OAuth 客户端必须为桌面公共客户端允许该回环重定向（通配端口、精确 `/auth/callback` 路径）。回环默认关闭，直到部署方开启（OEM profile 的 `sdkwork.iamLoopbackRedirect: true`，或 `DSH_DESKTOP_IAM_LOOPBACK=1`）；关闭或壳拒绝监听时回退到已注册的自定义 scheme。只有顶层文档导航能到达该监听器：携带 `Origin` 或非导航 Fetch Metadata 的请求在转发前即被拒绝，`Host` 必须是已绑定的回环地址，两种响应都带 `no-store` 与 `X-Content-Type-Options: nosniff`。租户尚未注册 loopback redirect 前不要开启：托管授权页会在任何回调到达应用之前以 `OAuth redirect_uri is not registered for this client` 拒绝该请求。租户的 relying party 注册缺失、被禁用或未绑定部署应用时，该页在任何登录界面出现之前就会失败：应用只收到 `server_error` 与页面的通用描述，因为服务端的问题详情文档（400 `iam_oauth_client_invalid` / `iam_oauth_authorize_invalid`，或 500 `iam_oauth_authorization_create_failed`）留在浏览器页面里，除非该页把它转发到 `error_description`——因此尚未完成注册的部署在注册落地前应设置 `signInMethod: modal`。待处理流程有截止时间，浏览器端的授权或完成失败会通过同一个 deep link 回传（`error` + `error_description` + `state`），交接卡片因此能显示失败并重试，而不是一直等到超时。兑换会携带稳定的安装级 device id，新登录只替换该设备在同一应用下的旧会话：完成授权的浏览器会话和用户的其他设备保持登录。兑换是至多一次：该调用关闭生成传输层的重试，同一回调的第二次投递观察第一次尝试的结果——重试或重放一次性授权码只会在服务端已消费它之后被拒绝。待处理流程的截止时间为四分半，位于服务端五分钟授权窗口之内，因此晚到的交接报告登录已过期而不是兑换失败；失败自身的原因（运行时的 message 与 detail）渲染在本地化步骤行之下，并写入控制台。该流程依赖标准 `sdkworkDesktop` preload 桥（`deepLinks` / `shellOpen`）。待处理的 PKCE 流程持久化在渲染进程存储中（仅 verifier 与 state，兑换成功或过期即清除），因此浏览器登录在桌面应用退出后才完成时，deep link 重新拉起应用仍能完成登录；没有待处理流程的回调会被忽略，而不是报成登录失败。等待中的登录还会每两秒向桌面壳取一次它保留的最后回调：窗口事件没有积压，因此在渲染端没有监听器时（文档正在重载，或插件尚未 bootstrap）到达的回调会从壳的 `deepLinks.getInitialUrl` 取用中恢复，而不是让这次尝试空等到截止时间。

兑换成功后走与页面内登录相同的收尾：完整会话（双 token、可轮换的 refreshToken、sessionId 与 AppContext）先写入持久存储，再发布到共享 TokenManager，随后用这份凭据读取账号资料补全身份（显示名、姓名、首字母、邮箱、用户名），最后交给认证控制器并排定预过期刷新。资料读取受预算约束且尽力而为——它失败或超时只让缓存身份退化为兑换返回的身份，不会把已经成功的登录报成失败。401/403 是例外——网关拒绝了每个 SDK 客户端都会使用的这份凭据，因此登录报 `session-rejected`，刚写入的会话被丢弃，不再有 SDK 客户端持有失效 token。交接卡片的失败状态按运行时错误码指出失败环节（浏览器未批准、兑换失败、流程超时、回调无法校验、环境不支持等），不再把所有失败都说成“浏览器打不开”；失败状态同时给出“内置弹窗登录”，让租户的授权注册尚未就绪时也只差一次点击。冷启动兑换失败时，浮层一旦挂载就立即呈现该失败与恢复操作，而不是把用户留在没有任何解释的匿名工作区。失败卡片还会在失败原因下方保留「查看错误详情」：优先展示服务端返回的问题详情文档（HTTP 状态、业务错误码、追踪 ID 与响应内容），其后才是运行时的错误码、消息与详情，并支持把整份报告一键复制为带字段名的文本，让支持报告直接指出出错的服务端调用，而不是只复述一句通用提示。托管页在把任何信息交回应用之前就失败时，应用会再向同一个匿名的授权引导端点询问一次，因此该报告仍然能出现，而不是只剩一个 `server_error`；报告展开期间卡片会加宽，给这份文档合适的宽度。

存储是凭据权威：预过期刷新轮换出的 token 会立刻替换共享 TokenManager 中的值，而只写 token 的会话写入会保留缓存身份与 AppContext，因此刷新不会让账号行在下次启动后变空，也不会让 SDK 继续使用即将过期的 access token。退出登录是同一次确认之下的两个独立部分。浏览器部分在登录 origin 上结束托管会话（桌面的 OAuth 注销，或页面本地会话的退出登录页）；产品部分则自成权威：用 refresh token 调用 IAM app-api 的注销操作撤销本地会话（access token 过期后仍然有效），并清空本地副本与共享凭据。浏览器部分绝不阻塞产品部分：浏览器拒绝打开、或部署未提供该托管端点时，本地与服务端会话仍会结束。本地清理完成后，服务把退出登录报告给桌面壳（`dshDesktop.auth.signedOut`），是否回到未登录 landing 由壳决定；纯浏览器页面没有这样的壳。进行中的登录只在这条尝试已不再等待时才被判定失败：过期、伪造或重复的回调被忽略，卡片保持等待，真实回调仍可完成这次登录。窗口事件从未投递的回调会在尝试等待期间从壳中取回，因此丢失的事件会结算登录而不是表现为过期。尝试结算时其载体随之释放：过期或兑换被拒绝会关闭回环监听器并停止取用，而让流程继续等待的过期链接保留两者。

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
- 中转会话镜像（`relay-credential.ts`）串行化写入并对每个令牌只写一次；被拒绝的写入会记录，并在下一次凭据变化时重试。未登录挂载时会清掉上一个页面遗留的引用，因此在页面关闭期间结束的会话无法继续用旧令牌认证中转请求。
- `@deepseek-ai/dsh-client-ui-sdkwork-iam/src/sdkwork-global-token-manager.ts` 持有浏览器全局 `AuthTokenManager`，供每个 SDKWork 客户端插件共享。IAM 登录会把合并后的 IAM 与环境凭证写入该 manager；Drive、Knowledge、Token Plan、Feedback 与 Agents 表面读取同一传输层，而不是各自创建隔离 manager。
- 认证表面是 sdkwork 组件；其 Tailwind 工具类来自 `apps/web` 的 Tailwind 管线（`@source` 指向 sdkwork 包，`primary-*` 别名到 harness 的 deepseek 品牌色阶）。浅色表单控件叠加 `--dsw-alias-bg-overlay` 与 `--dsw-alias-border-l2`，而不是浅色下塌成同一白色的 `bg-layer-*`；深色控件使用 `bg-layer-1` 对照 elevated shell。二维码列使用与 shell 相同的填充；白色画布外的框是透明的。叠加 CSS 以 CSS Module（`sdkwork-auth.module.css`）随客户端 bundle 注入。
- 本包的 tsc 发射把 `@sdkwork/*` 解析到本地声明门面（`sdkwork-types/`）——sdkwork 源码无法可移植地发射进 `lib/types`；针对真实包的完整类型检查在 `tsconfig.tests.json`（接入 `typecheck:contracts-ready`）中运行，是门面的漂移守卫。tsdown 客户端 bundle 换用无 paths 的 tsconfig 以内联私有认证与 i18n 源码包，把 qrcode 钉到浏览器入口（其 node 渲染器会把 `fs` 拖进浏览器 bundle），并清空 sdkwork 闭包中唯一一个普通样式表（一个本 harness 从不挂载的组件错误页 css）。发布包只声明公共的 `@sdkwork/iam-app-sdk@0.1.1` 可选依赖；npm 消费者不会解析私有源码包。

## 模型体验

中转会话镜像只改变模型请求的认证方式，不改变请求内容：它把已登录令牌写入 BirdCoder 路由读取的 Host 凭据面，并在退出登录时移除。它不新增提示词分区、工具或会话内容。

#### KV Cache effect

无；本包既不组装也不发送 provider 请求。

## 已知限制与后续工作

- **验证码登录**——邮箱/手机验证码登录与需要验证的注册依赖消息验证码 API；harness app 客户端未暴露它，因此这些方式被隐藏或呈现后端策略的要求。
- **扫码与 OAuth 登录**——默认关闭；启用需要后端特性与提供方目录。
- **浏览器登录需要租户完成 relying party 注册**——`signInMethod: browser` 打开租户托管授权页；在租户应用 `agent.app.config.json` 里的 `oauth.relyingParty`（`clientId: birdcoder`、`redirectUris: ["birdcoder://auth/callback"]`）被应用并绑定部署应用之前，该页会拒绝开始授权。应用只看到 `server_error`，除非托管页把服务端自己的报告一并转发；因此未应用该配置的租户应设置 `signInMethod: modal`。
- **单一个人会话**——组织/登录上下文选择挑战会呈现 sdkwork 对话框，但 harness 没有租户管理；多租户流程未经测试。
- **托管会话结束是部署契约**——URL 指向 OEM profile 的 `iamAuthorizeBaseUrl` 上的托管 OAuth 组（桌面客户端用 `/oauth/logout`，页面本地会话用 `/oauth/sign-out`）；托管认证表面不提供这些端点的部署会打开一个无法结束浏览器会话的页面，而产品会话仍会经 app-api 撤销并在本地清空。
- **回环登录只在其监听器存活期间跨渲染端重载**——RFC 8252 监听器（五分钟上限）在桌面壳中，而 PKCE 流程在渲染端；重载会重建页面，新页面通过 `loopbackLogin.pending()` 接管等待中的 redirect，并通过 `loopbackLogin.takeCallback()` 取走壳在中断期间接受的回调，因此登录仍能在这个时限内完成。超过时限后需要重新发起浏览器登录。已注册的自定义 scheme 回调没有这一时限：壳会为等待中的流程保留最后接受的回调 URL。
- **出厂的深链回调使用短产品 scheme**——品牌注册的是 `birdcoder://auth/callback`；RFC 8252 第 7.1、8.4 节要求反向域名的私有 scheme，而品牌的应用 id（`com.sdkwork.birdcoder`）正是该身份。OEM profile 可以把 `com.sdkwork.birdcoder://auth/callback` 写成 `sdkwork.iamRedirectUri`；Host 接受它、打包应用向操作系统声明它，只剩租户的 OAuth 客户端注册需要跟上。第 8.10 节要求的“每个授权服务器一个独立 redirect”仍是部署决定（所有 tier 共用一个回调），而 origin 变化会放弃待处理流程，而不是把 code 拿去对另一个授权服务器兑换。应用 id scheme 上接受 RFC 8252 第 7.1 节定义的两种私有 scheme 形式：`com.sdkwork.birdcoder://auth/callback` 与无 authority 的 `com.sdkwork.birdcoder:/auth/callback`；出厂的短 scheme 仍使用带 authority 的形式。
- **回环监听器只绑定 IPv4**——RFC 8252 第 7.3 节建议同时尝试两种地址族。部署注册的是 `http://127.0.0.1:<端口>/auth/callback`，因此监听器呈现该字面量，不回退到 `[::1]`。

### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

`sdkwork-global-token-manager.ts` 持有每个 SDKWork 客户端插件共享的浏览器全局 `AuthTokenManager`——IAM 登录把合并后的 IAM 与环境凭证写入该 manager，Drive、Knowledge、Token Plan、Feedback 与 Agents 表面读取同一传输层，而不是各自创建隔离 manager。tsc emit 将 `@sdkwork/*` 解析到本地声明门面；针对真实包的 `tsconfig.tests.json` 类型检查是门面的漂移守卫。

</details>

## 运行时不变量

不发布运行时不变量伴随检查；account 接缝交换是一次服务调用（`ctx.account.setSource`），settings 菜单按原契约消费；IAM 会话事实经 sdkwork 控制器自己的状态机流转，认证界面通过标准 keyed slot 挂载；会话/展示一致性直接由本包的客户端行为规格测试覆盖。
