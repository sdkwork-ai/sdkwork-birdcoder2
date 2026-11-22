# Agent Note: 原生应用 OAuth 表面拒绝伪造的 loopback 回调，并提供手动登录路径

Status: implemented

[English](2026-11-22-native-app-oauth-conformance.md) | 中文

## 问题

桌面浏览器登录是一个 OAuth 2.0 原生应用流程：系统浏览器打开托管授权页，授权码通过注册的自定义 scheme（`birdcoder://auth/callback`）返回；在部署启用时，也通过 RFC 8252 的 loopback 重定向（`http://127.0.0.1:<临时端口>/auth/callback`）返回。有四处缺口使该表面未完全达到标准，也让登录不完整：

1. loopback 监听器接受任何携带 `code`/`error` 参数的 `GET`。RFC 8252 第 7.3 节把该监听器视为本机任何调用者都可访问，因此网页可以驱动回调（PKCE 与 state 仍决定结果），也能把该监听器当作探测口。
2. 当窗口渲染端正在退出时投递深链回调，`webContents.send` 会抛出异常。该异常跳过了投递之后的对端共享，使持有该流程的进程丢失 URL；同时，preload 中抛出异常的订阅者会让同一事件的其他订阅者收不到通知。
3. 交接卡片只提供「重新打开浏览器」。当系统浏览器报告成功却没有显示窗口（另一个桌面、吞掉请求的浏览器）时，等待中的流程没有手动路径，尽管应用已持有确切的授权 URL。
4. `startPendingSignIn` 在页内表面存在之前就消费了欢迎页的一次性登录请求。浏览器手势可以在没有该表面的情况下运行，页内账号表单不能：overlay 渲染失败的组合会丢失登录，而不是稍后呈现它。

## 决定

原生表面现在拒绝它不可能合法收到的请求，容忍失败的投递，并为等待中的尝试保留手动路径。

- **loopback 请求来源校验。** 只有顶层文档导航可以通过：携带 `Origin`、`Sec-Fetch-Mode` 不是 `navigate`、或 `Sec-Fetch-Dest` 不是 `document` 的请求一律返回 `404` 且不再转发。针对已绑定 `127.0.0.1:<端口>` 的 `Host` 校验保留，两种响应都带 `Cache-Control: no-store`、`X-Content-Type-Options: nosniff`，成功页保持 `Content-Security-Policy: default-src 'none'`，且不含脚本、外部引用或密钥。
- **投递不会丢失回调。** 主进程桥接层保护 `webContents.send`，被销毁的窗口不再跳过对端共享，URL 仍保留在壳的取用接口里供渲染端恢复轮询（[回调恢复](../bug-fix/2026-11-22-deeplink-callback-recovery.zh.md)）。preload 对每个订阅者隔离异常，因此即使一个订阅者抛出，登录运行时与页面诊断仍都能观察到交接。
- **手动登录路径。** 运行时在调用壳打开浏览器时捕获授权 URL——那是它唯一存在的位置——并在尝试等待期间暴露该 URL。交接卡片以复制动作提供它；一旦尝试结算就消失，因为已使用或已过期的 `state` 不应再次打开。
- **页内手势等待其表面。** `startPendingSignIn` 在没有 modal 宿主时启动浏览器手势；当配置的手势是页内表单时，把请求留给挂载中的宿主。`attachModal` 为当前存活的尝试呈现等待中或失败的卡片。
- **登录身份变化时放弃进行中的尝试。** 当 app-api origin、托管 origin、client id 或回调变化时，`ensureDesktopLogin` 会先取消旧运行时再替换，使旧授权服务器的持久化 PKCE 流程被清除，而不是留待对新服务器兑换。
- **回环尝试在其监听器时限内跨渲染端重载存活。** 壳暴露等待中的 redirect（`loopbackLogin.pending`），并保留一条在无页面监听期间接受的回调（`loopbackLogin.takeCallback`，取用即销毁）。重载后的页面接管该载体、一次性取走保留的 URL，并对持久化流程兑换，因此在监听器五分钟时限内重载不再牺牲一次回环登录。
- **欢迎页手势等待其设置分区。** 交接在 apply 时运行，此时 IAM 设置 scope 仍报 `loading`；请求最多等待该分区两秒，因为按默认值选择可能为配置为页内表单的部署启动浏览器交接。始终不出现的设置文档会回退到出厂手势，而不是挂住登录。
- **品牌的反向域名身份也是一种回调 scheme。** 外壳把 `desktop.appId` 作为 `DSH_BRAND_APP_ID` 上报，打包器把产品 scheme 与该应用 id 都声明进操作系统协议注册，OEM profile 可以把 `com.sdkwork.birdcoder://auth/callback`——或 RFC 8252 第 7.1 节示例的无 authority 形式 `com.sdkwork.birdcoder:/auth/callback`——写成 `sdkwork.iamRedirectUri`。OAuth client id 仍以品牌协议 scheme 命名；应用 id 形式正是 RFC 8252 第 7.1、8.4 节对私有 scheme 重定向的建议。
- **尝试结算时释放其载体。** 过期、兑换被拒绝、或使流程停止的过期回调，会关闭 loopback 监听器、停止取用并丢弃授权 URL；让流程继续等待的过期链接则三者都保留。

## 标准符合性

原生应用 OAuth 最佳当前实践里客户端可观察的要求，以及各自的落实位置与回归测试：

| 要求 | 落实 | 回归 |
| --- | --- | --- |
| 只由外部 user-agent 执行授权（RFC 8252 第 5、6、8.12 节） | `openExternal` 把授权 URL 交给壳桥接层，由壳打开系统浏览器；没有任何窗口加载托管页 | `iam-deeplink-login-e2e` 断言 URL 到达 `shellOpen` 且交接卡片等待 |
| 公共原生客户端使用 S256 PKCE（第 6、8.1 节；RFC 7636） | 运行时每次尝试生成 43 字符 base64url verifier 与 S256 challenge | `iam-deeplink-login-e2e` 断言 `code_challenge_method=S256`、challenge，以及兑换中的 verifier |
| redirect URI 在 scheme、authority、path 上精确匹配（第 7.1、8.4、8.10 节） | `matchesIamRedirectUri`；仿冒 scheme、外部 path 与产品链接均被拒绝 | `iam-deeplink-links.spec.ts` 的匹配器与桥接用例 |
| loopback 重定向使用 IP 字面量、临时端口、精确 path，并校验 `Host`（第 7.3、8.3 节） | `iam-loopback-redirect.ts` 绑定 `127.0.0.1:0` 并做双重校验 | `iam-loopback-redirect.spec.ts` |
| loopback 端口只为一次尝试打开并随其关闭（第 8.3 节） | `begin` 打开；提交、取消、过期与打开失败都会关闭 | `iam-loopback-redirect.spec.ts`、`iam-desktop.client.spec.ts` |
| 只有浏览器导航能到达监听器（第 7.3 节） | `isBrowserNavigation` 拒绝 `Origin` 与非导航 Fetch Metadata；响应带 `no-store`、`nosniff`、`default-src 'none'` | `iam-loopback-redirect.spec.ts` |
| 高熵 `state`，任何不带待处理值的响应都被拒绝（第 8.9 节） | 运行时为每个流程保留 24 字节随机数；控制器常量时间比较，不匹配时保留流程 | `iam-deeplink-login-e2e` 的过期回调用例 |
| 请求中使用的 redirect 与流程一同存储，响应必须落在其上（第 8.10 节） | 流程存储 `redirectUri`；运行时按描述符解析，身份变化时放弃尝试而不跨授权服务器 | `iam-service-browser-login.client.spec.ts` 的身份变化用例 |
| 公共客户端不提交共享密钥（第 8.5、8.9 节） | 兑换体只含 code、client id、verifier、redirect、device id，并设 `skipAuth` | `iam-desktop-redeem.client.spec.ts` |
| 授权码单次使用（第 8.1、8.12 节；RFC 6749 第 4.1.2 节） | 每个 code 至多兑换一次，且禁用传输层重试 | `iam-desktop-redeem.client.spec.ts` |
| 令牌不出现在 URL 或日志中（RFC 9700 第 4.2 节） | 回调只携带 code；失败只记录 code 与消息，从不记录令牌 | `iam-deeplink-login-e2e` 的失败用例 |

品牌拥有两种私有 scheme：短产品 scheme 与反向域名应用 id（`desktop.appId`）。RFC 8252 第 7.1、8.4 节建议后者，因此外壳把它作为 `DSH_BRAND_APP_ID` 上报，打包应用把两种 scheme 都声明进协议注册，OEM profile 可以把任一写成 `sdkwork.iamRedirectUri`；出厂默认仍是短 scheme，直到租户注册应用 id 回调。品牌的应用 id 可以使用 RFC 8252 第 7.1 节定义的两种私有 form——`com.sdkwork.birdcoder://auth/callback`，以及无 authority 的 `com.sdkwork.birdcoder:/auth/callback`——而短产品 scheme 仍使用带 authority 的形式。另外两点仍属部署决定，已记录为已知限制：所有 tier 共用一个回调而不是每个授权服务器一个（第 8.10 节），以及 loopback 监听器只绑定 IPv4（第 7.3 节建议同时尝试两种，而部署注册的是 IPv4 重定向）。RFC 8252 附录 B.3 建议在 Windows 上设置 `SO_EXCLUSIVEADDRUSE`；Node/Electron 没有可移植的 socket 选项可设置，已绑定端口上的 state 校验仍是闸门。

## 备选方案

**保留宽松的 loopback 监听器，仅依赖 state 校验。** PKCE 与 state 确实决定结果，但监听器仍会对网页请求返回成功页并把伪造的授权码转发进运行时，这是原生应用不必接受的噪声。

**拒绝所有没有 Fetch Metadata 头的请求。** 较旧的浏览器与本机调用者不会发送这些头；监听器会对它们失效，而 state 校验本就保护着流程。只有能明确判定为非导航请求的头才会被拒绝。

**在登录开始时把授权 URL 发送给渲染端，而不是在壳调用处捕获。** URL 由 auth 运行时用它生成的 PKCE 对构造；壳打开调用是本模块观察到它的最早位置，且无需重复构造该 URL。

**在页内 overlay 始终不挂载时渲染一个页内替代表面。** 那会重复 auth 栈的表面；让请求等待真正的挂载是更小的决定。

## 后果

本地网页不再能驱动 loopback 回调或读取监听器的结果页，窗口在投递中途关闭也不再牺牲登录。浏览器静默未能打开的用户可以复制授权 URL 并在任意浏览器中完成登录，表面尚未渲染的欢迎页请求仍会启动浏览器登录。代价是等待卡片多一个剪贴板动作、loopback 契约更严格（浏览器通过导航即可满足），以及配置为页内表单时请求会等待而不是被丢弃。

## 验证

`apps/desktop/tests/iam-loopback-redirect.spec.ts` 证明伪造请求被拒绝（Origin、`no-cors`、非 document destination）、导航仍可通过、`nosniff` 头，以及等待中的载体与其一次性保留回调。`apps/desktop/tests/iam-deep-links.spec.ts` 证明抛异常的窗口仍会共享回调并为渲染端取用保留它，且抛异常的订阅者不会饿死其他订阅者。`packages/client/ui-sdkwork-iam/tests/iam-desktop.client.spec.ts` 证明授权 URL 只在等待期间暴露、结算时释放，并且重载后的页面会接管等待中的回环载体并兑换其保留回调。`packages/client/ui-sdkwork-iam/tests/iam-service-browser-login.client.spec.ts` 证明浏览器手势无需宿主即可启动、页内手势等待宿主、仍为 `loading` 的设置分区会在请求被消费前决定手势、始终不出现的分区会回退到出厂手势，以及身份变化会放弃进行中的尝试。`packages/client/ui-sdkwork-iam/tests/sign-in-overlay.client.spec.tsx` 证明复制动作只对等待中的尝试出现，并复制确切的 URL。
