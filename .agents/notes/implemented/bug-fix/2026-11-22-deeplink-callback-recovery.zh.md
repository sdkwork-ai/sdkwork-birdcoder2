# Agent Note: 深链事件丢失后桌面浏览器登录仍会结算

Status: implemented

[English](2026-11-22-deeplink-callback-recovery.md) | 中文

## 问题

桌面浏览器登录通过 `birdcoder://auth/callback` 返回。桌面壳以 preload 桥上的 `sdkwork:deepLinks:open` 事件把回调交给渲染端，而事件没有积压：URL 到达时，持有待处理 PKCE 流程的渲染端若没有监听器——文档正在重新加载、插件尚未 bootstrap，或插件还没有重建运行时——这次投递就会被丢弃。桌面壳会为 `deepLinks.getInitialUrl` 的取用保留已接受的回调，也会把它推进渲染端的待处理状态，但之后没有任何一方再去询问，于是这次尝试一直等到四分半的截止时间，最后报成流程过期。

一次生产环境的尝试展示了整条链路：IAM installation 没有 deploy application 锚点，托管授权页因此以 `error=server_error` 应答，桌面壳接受了该回调并通过 relay spool 共享，而工作区仍停留在等待卡片上，`sdkwork.iam.desktopAuthFlow.v1` 里也仍然保留着待处理流程。同一交接背后还有第二处独立缺口：`startPendingSignIn` 在 modal 宿主挂载之前不会启动配置的登录手势，因此当 overlay 条目始终没有渲染时，欢迎页的一次性登录请求处于惰性状态——没有托管页、没有卡片、没有失败，也没有登录。

## 决定

等待中的浏览器登录自行取用桌面壳已接受的回调，登录手势也不再依赖页内表面。

- **等待中的流程会主动取回丢失的回调。** 在尝试等待期间，`createIamDesktopLogin` 每两秒读取一次 `bridge.deepLinks.getInitialUrl()`，把桌面壳持有的 URL 交给与事件相同的控制器路径分发。只有等待中才会取用：该取用是破坏性的，空闲的运行时绝不能消费下一次尝试需要的 URL。已结算的尝试停止取用；`cancel()` 与 `dispose()` 释放定时器；过期 URL（`no-pending-flow` 或 `state-mismatch`）会让本次尝试继续等待真正的回调。
- **欢迎页交接不再等待 modal 宿主即可启动手势。** 托管页才是登录表面，页内卡片只负责呈现它。`startPendingSignIn` 现在即使 `attachModal` 尚未执行也会消费一次性请求并执行配置的手势；`attachModal` 在挂载时补上等待中或失败的卡片，因此迟到的宿主是追上进行中的尝试，而不是阻塞它。

## 备选方案

**在主进程排队已接受的回调，并在渲染端加载时重发。** 这需要新增 preload/IPC 表面，而且对回调到达时没有监听器的运行中渲染端仍然无效。

**保留 modal 门控并依赖事件。** 卡片是某次可能根本不会启动的登录的唯一呈现；等待卡片正是 overlay 未渲染时欢迎页登录失效的原因。

**只在用户可见的重试手势之后轮询。** 用户仍会在等待卡片上坐满整个截止时间，才得知浏览器登录已经完成或失败。

## 后果

事件丢失的回调现在会在轮询间隔内结算本次尝试：交接卡片会报告托管页的失败（例如没有任何 relying-party 锚点的部署收到的 `server_error`），而不是过期；或者提交浏览器已经产出的会话。即使 overlay 条目始终没有渲染，欢迎页登录也会执行，并在该条目挂载时显示卡片。代价是流程窗口内每两秒一次 IPC 取用，以及迟挂载的 overlay 会在浏览器页之后而不是之前呈现卡片。

## 验证

`packages/client/ui-sdkwork-iam/tests/iam-desktop.client.spec.ts` 证明取用能恢复事件从未触发的回调、过期取用会让登录继续等待、取消会停止定时器。`packages/client/ui-sdkwork-iam/tests/iam-deeplink-login-e2e.client.spec.ts` 用真实运行时与令牌存储跑通一次事件从未到达页面的登录。`packages/client/ui-sdkwork-iam/tests/iam-service-browser-login.client.spec.ts` 证明欢迎页请求在宿主挂载前就会启动托管登录，并证明挂载会呈现进行中的尝试。
