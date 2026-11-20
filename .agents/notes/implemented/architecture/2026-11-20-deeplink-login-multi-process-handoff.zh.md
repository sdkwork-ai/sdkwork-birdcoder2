# Agent Note：深链登录回调只会到达持有其 PKCE 流程的进程

Status: implemented

[English](2026-11-20-deeplink-login-multi-process-handoff.md) | 中文

## Problem

桌面浏览器登录通过自定义 URL scheme（`birdcoder://auth/callback`）返回。操作系统对同一个 scheme 只保留一个处理程序关联，因此当正式版和开发版同时运行时，两者都注册同一个 `birdcoder://` scheme，最后由 `setAsDefaultProtocolClient` 调用者（或系统默认选择）接收回调。正式版因此经常收到开发版发起的登录。

送达错误进程的回调无法完成登录。待处理的 PKCE 流程（包含 `state` 与 verifier）保存在发起方渲染进程的存储中；接收方渲染进程没有匹配流程，只会报告一个过期/外来回调，发起方则一直等待到四分半钟的超时。两个进程都合法注册同一 scheme 时，协议归属并非应用可以控制的事情。

## Decision

生产默认是已注册的自定义 scheme 加按 `state` 路由的本地中继：不需要 IAM 变更、保留冷启动续登，也是多数已安装桌面应用采用的模式。RFC 8252 回环重定向作为按部署开启的可选路径，仅在“每进程隔离”的收益超过这些成本时使用。每个 Desktop 主进程都可以为一次登录启动 `127.0.0.1:<临时端口>/auth/callback` 监听；渲染进程把该地址作为 `redirect_uri`，IAM desktop-auth 运行时对返回的 `state`/PKCE 做与深链完全相同的校验。监听只绑定回环，只接受回调路径上 `Host` 匹配的 `GET`，返回本地化、无脚本的结果页，并保持监听直到渲染进程结束该流程（伪造的本地回调不得关闭它）；取消与超时会停止监听。回环默认关闭，直到部署方开启（OEM profile 的 `sdkwork.iamLoopbackRedirect: true`，或 `DSH_DESKTOP_IAM_LOOPBACK=1`），否则回退到已注册的自定义 scheme。租户尚未注册 loopback redirect 前开启，会让托管授权页在任何回调到达应用之前以 `OAuth redirect_uri is not registered for this client` 拒绝请求。后端契约为桌面公共客户端允许 `http://127.0.0.1:<任意端口>/auth/callback`（RFC 8252 §7.3），强制 PKCE，不允许 client secret。该路径完全不涉及系统协议关联，因此同一通道的两个安装也能分开。

它不作为默认，是因为需要额外注册，且应用退出后无法完成登录。

默认中继路径不需要 IAM 变更。每个 Desktop 进程加入按品牌协议划分的本地中继。中继：

- 在 `127.0.0.1` 上启动临时端口的回环 HTTP 监听，并把 `{ pid, endpoint, token }` 以 `0600` 文件发布到操作系统临时根目录下按用户隔离的 `0700` 目录；
- 记录渲染进程打开的每个托管授权页的 `state`（`states/<hash>.json`，`0600`），并把已知 state 的回调直接路由给拥有它的实例，授权码通常不会到达其他进程；
- 当 state 未知（旧客户端）或拥有者已退出时，在本地投递之后回退为广播给所有存活实例；
- 把对端回调通过同一个 `sdkwork:deepLinks:open` 路径投递给本地渲染进程，且不再二次广播；
- 把回调暂存十分钟，使在链接到达之后才启动的实例仍能收到（IAM 授权窗口为五分钟）；
- 拒绝非回环、缺少每实例 token、超过 8 KiB 或不是已注册回调形状的请求。

每个渲染进程都会看到回调，但只有持有待处理 PKCE 流程的那一个会兑换它；其他进程把它归类为无待处理流程/state 不匹配并保持静默。因此正确性不依赖哪个进程拥有系统协议、不依赖 `setAsDefaultProtocolClient` 的调用顺序，也不依赖两个通道共享 profile。中继里的 token 是本地投递凭据而非 OAuth 秘密；被中继的 URL 只包含一次性授权码，且绑定发起方持有的 verifier。

中继在传输层是尽力而为的：启动失败或对端不可达只记录日志，不抛给系统处理程序或插件；对于拥有该 scheme 的进程，本地处理仍然工作。

## Alternatives considered

**给开发版单独分配 scheme。** 这是原生应用最清晰的隔离方式，但 OEM profile 要求重定向 scheme 等于品牌清单的 `desktop.protocol`，且 IAM OAuth 客户端必须注册新的 redirect URI。对每个开发通道都是部署变更；而且当两个进程注册同一 scheme 时（例如两个开发 lane）仍会失败。

**在没有后端允许列表的情况下使用回环。** RFC 8252 推荐方案，也是这里的可选路径，但只有在 IAM OAuth 客户端允许 `http://127.0.0.1:<端口>/auth/callback` 后才生效；没有该部署变更时授权页会拒绝请求，因此默认仍使用自定义 scheme 中继。

**让 IAM 运行时提供路由 id，而不是观察授权 URL。** `state` 在运行时内部，但渲染进程请 shell 打开浏览器时，shell 已经能看到完整授权 URL，因此中继在浏览器打开前记录该 `state`，无需改 SDK。未记录到 state 的回调仍回退为广播。

**只在登录进行时注册 scheme。** 系统关联是持久的，且没有可移植 API 恢复之前的处理程序；两个并发登录仍会竞争，macOS 的 LaunchServices 偏好也可能覆盖注册。

## Consequences

- 启用回环时，登录总会回到发起它的进程；不涉及系统协议关联，同一通道的两个安装也能分开。登录完成、取消或超时后监听立即消失；应用在登录中途退出则无法在重启后完成（端口已不存在），交接卡片会报告其为过期尝试。
- 使用自定义 scheme 回退时，两个进程都在运行则回调总会到达持有待处理流程的进程，与系统协议归属无关。
- 在拥有方进程启动之前到达的回调会在 spool 中保留十分钟；在该窗口内重新打开对应构建即可完成登录。
- Desktop 运行期间会多一个回环监听和一条很小的注册表条目；正常退出时两者都会消失。崩溃后，下一次启动会清理 PID 已不存在的条目。
- 验证：`apps/desktop/tests/iam-loopback-redirect.spec.ts`（回环监听、拒绝、超时、替换）、`apps/desktop/tests/iam-deep-link-relay.spec.ts`（state 路由、广播回退、spool、鉴权拒绝、过期清理、dispose）、扩展后的 `apps/desktop/tests/iam-deep-links.spec.ts`（对端投递、系统回调共享、授权 URL 上报）、IAM 端到端回环/回退用例，以及挂载 shell 的启动测试套件。
