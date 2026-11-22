# Agent Note: 启动欢迎页的登录会先重新启动预加载的工作区再执行浏览器登录

Status: implemented

[English](2026-11-19-desktop-welcome-login-boot-handoff.md) | 中文

## 问题

欢迎窗口的「登录」是产品进入 SDKWork IAM 浏览器登录的入口（[决策](../feature/2026-11-04-unified-login-surface.zh.md)）。桌面壳的投递方式是：在 workspace 的 boot 响应里放入一次性的 `__DSH_IAM_SIGN_IN__`，然后进入 workspace，由 IAM 服务消费该值并打开托管授权页。

这一投递假设 workspace 在欢迎页交接*之后*才启动。事实并非如此：`reconcileBackend` 在启动 Host 之前就把隐藏的主窗口导航到 `dsh-app://app/`，目的正是让文档在后端就绪期间先加载；`openInitialWindow` 则在 Host 应答之后才决定显示欢迎页还是工作区。对未登录的启动来说，这意味着欢迎页出现之前，文档的 `dsh-app://app/` boot 响应就已经应答完毕。`enterWorkspace` 复用了缓存中的导航而不是重新加载文档，于是读取一次性值的 boot 处理不会再运行。点击「登录」关闭欢迎窗口、露出已经加载好的工作区，却没有启动任何东西：既没有系统浏览器页面，也没有交接卡片，更没有报错。

同一个启动时序还留下了第二处缺口。`IamService.attachModal` 在插件 apply 期间被调用，传入的包装函数转发到 overlay store 绑定的动作，而那些动作要等 overlay 条目渲染之后才存在。apply 期间就消费掉的启动请求因此可能在浏览器已打开的同时，把 `openBrowser` 发往尚未绑定的包装函数并被丢弃——交接卡片始终不出现。冷启动时失败的回调也面临同样结果。

## 决定

交接现在能够到达已经完成首次启动的文档，而它需要的表面在请求呈现之前就已存在。

- **由一次强制启动承载请求。** `navigateMain(url, reload)` 会发起一次全新的文档加载，而不是复用匹配的缓存导航，`enterWorkspace({ reload })` 将其透传。欢迎页在启动场景下的 `iamSignIn` 会置上 `pendingIamSignIn`，并以 `reload: true` 进入工作区；重新加载的文档在 boot 响应中得到 `__DSH_IAM_SIGN_IN__`，IAM 服务随即按配置的登录手势启动浏览器登录并显示交接卡片。工作区内的登录页（`welcomePurpose === 'sign-in'`）仍在不重新加载的前提下解析为 `'login'`，因为在那里由运行中的渲染端自己启动登录，且必须保留其表面状态。
- **页面不能重复交接。** 欢迎渲染端在点击期间持有一个 starting ref，并把入口的「登录」动作标记为 busy 并显示打开登录的文案，重新加载尚未完成时的第二次点击会被忽略，页面也说明了正在做什么；交接被拒绝时清空该引用，使动作可以重试。
- **服务在宿主挂载时呈现。** `IamService.attachModal` 改由 overlay 条目的 inject 工厂传入真实的绑定动作，并推迟一个微任务以避开 React 渲染阶段，不再在 apply 时以转发包装函数调用。配置的登录手势不再等待这次挂载（[后续决策](2026-11-22-deeplink-callback-recovery.zh.md)）：在首次渲染之前记录的请求会立即启动登录，挂载时附着动作并呈现它此前缺失的进行中尝试。

## 备选方案

**不重新加载，而是向运行中的 workspace 发送一条运行时 IPC 指令。** 这样可以避免重启文档，但需要新增 preload 方法、渲染端监听器，以及一个用于缓存在插件挂载前到达请求的队列；而一次性的 boot 值本来就是这个契约。

**把 workspace 的预加载移到欢迎页决策之后。** 未登录启动可以只用一个值启动一次文档，无需重新加载；但普通已登录启动会失去桌面壳在 Host 就绪期间加载好的文档，而这正是预加载存在的意义。

**让 boot 响应等待欢迎页结束。** 启动将等待用户手势，而更新与恢复流程也都会加入 Host 就绪 promise；一个久留的欢迎页会阻塞与之无关的工作。

**保留 apply 时的包装函数并增加 `modalMounted` 标志。** 服务会为同一个表面持有两种就绪概念，而且每条呈现路径仍需要判断动作是否可用；让 `attachModal` 本身表示「动作已存在」可以删掉这份状态。

## 后果

首次点击「登录」现在会打开托管授权页，并显示等待深链回来的交接卡片，启动入口与工作区内登录页最终落在同一个表面。代价是启动已预加载的文档会多启动一次；这次启动发生在欢迎页之后，且该文档在入口处没有值得保留的状态（未登录启动，或刚退出登录的工作区）。IAM 服务在 overlay 条目渲染之前没有卡片，而这正是用户能够看到或点击任何东西的时刻；启动时到达的请求会立即启动登录，并在该挂载时刻呈现卡片，因此请求既不会被丢弃，也不会被缺失的表面阻塞。桌面欢迎页 README 与 IAM 包 README 都记录了这两点。

## 验证

`apps/desktop/tests/welcome-startup.spec.ts` 新增启动用例：先断言启动只预加载一次 `dsh-app://app/`，再断言欢迎页的 `iamSignIn` 会第二次加载该文档，且其 boot 处理返回 `__DSH_IAM_SIGN_IN__` 全局值。`apps/desktop/tests/welcome-renderer.client.spec.tsx` 锁定重复点击的防抖。`packages/client/ui-sdkwork-iam/tests/iam-service-browser-login.client.spec.ts` 锁定：欢迎页请求在登录宿主挂载前就会启动托管登录，挂载时会呈现进行中的尝试。在桌面 `--online` 开发通道上，重新构建 IAM 客户端 bundle 并在设置 boot 值后重新加载 workspace，`sdkwork.iam.desktopAuthFlow.v1` 中出现新的 PKCE 流程，并出现「已在浏览器中打开登录页」卡片；修复前的 bundle 不会显示该卡片。
