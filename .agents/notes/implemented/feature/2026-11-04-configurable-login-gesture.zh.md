# Agent Note: 可配置的登录手势，默认跳转浏览器登录

Status: implemented

[English](2026-11-04-configurable-login-gesture.md) | 中文

## Problem

产品登录入口的“登录”按钮只有一种行为：唤起页面内的 sdkwork 账号登录方式表单。托管 OAuth 浏览器登录其实早已端到端可用——`beginBrowserSignIn()` 通过桌面壳的 `shellOpen` 打开租户授权页，`birdcoder://auth/callback` 深链再经生成的 IAM 客户端兑换 code——但没有任何表面提供它。产品自己的登录体验就是托管页：它承载租户的密码、手机验证码、邮箱验证码、扫码、注册与找回密码流程，运行在用户浏览器里，能复用密码管理器与既有会话，也是本家族每个桌面应用使用的表面。让它不可达，等于让桌面端与 Web 产品拥有两套不同的登录。

有一个部署前提决定该页面能否加载：租户应用必须带有自己的 OAuth relying party 注册。缺少它时授权端点会返回 `invalid_client` 的 Problem+json 文档并渲染在浏览器里；应用看不到那个页面，因此无法在工作区里检测、解释或修复它。

## Decision

- **一个设置、一个手势。** `ui-sdkwork-iam` 在既有 `presentation` 之外新增 `signInMethod: 'browser' | 'modal'`，默认 `browser`。它是 volatile 的实时字段，浏览器半与扫码、OAuth 开关读取同一个设置分区。
- **所有登录入口共用一个分发器。** `IamService.startSignIn()` 执行配置的手势：`browser` 且存在桌面深链桥时，先切到新的 `browser` 浮层步骤并调用 `beginBrowserSignIn()`；`modal` 唤起页面内方式表单。登录面板的“登录”按钮、桌面欢迎页的两条交接路径（工作区内 `'login'` 结果与启动时的一次性请求）、以及 API Key 页以 `login` 结束的分支，全部调用该分发器，没有任何入口保留原先的无条件路径。没有桌面深链桥的页面始终使用页面内表单。
- **等待状态由交接卡片承担。** `browser` 步骤说明托管页已在浏览器打开，并提供“重新打开浏览器”重试。启动失败时渲染失败文案与同一个重试动作，而不是声称页面已打开。关闭卡片会取消等待中的尝试，兑换成功的会话会关闭卡片，因此迟到的深链不会再把表面打开。
- **relying party 是部署前提，已在清单中声明。** `agent.app.config.json` 已携带 `oauth.relyingParty`（`clientId: birdcoder`、`redirectUris: ["birdcoder://auth/callback"]`、公共客户端、`openid profile email offline_access`）。租户通过 PC 管理端的 relying party 界面或应用清单把它应用上去。尚未应用的租户设置 `signInMethod: modal`，这就是文档化的退出方式；应用无法自行回退，因为未注册客户端的错误发生在浏览器里。

## Alternatives considered

**默认使用页面内表单。** 不予采纳：托管页才是产品的登录（注册、找回、扫码，以及浏览器自身的会话与密码库），而这次的问题是部署侧的注册步骤，不是产品限制。为了迁就一个未应用配置的租户而隐藏产品登录，也会让浏览器手势只能通过未公开的设置触达。

**检测到 `invalid_client` 就静默回退到表单。** 不予采纳：浏览器页面在应用之外，没有可检测的对象；静默回退还会掩盖部署配置错误。

**保留页面内表单，另加一个“浏览器登录”按钮。** 不予采纳：登录手势是产品决定，入口上两个按钮等于让用户去选择产品早已决定的事。

**在交接卡片上提供“改用弹窗登录”开关。** 不予采纳：登录手势是部署决定，卡片级开关既违背配置值，又多出一条没有测试场景需要的入口路径。

## Consequences

桌面端点击“登录”后离开应用：浏览器打开租户托管登录页，工作区显示交接卡片，深链完成即登录并关闭卡片。该手势依赖租户的 relying party 注册；在注册生效前，浏览器会显示授权端点的 `invalid_client` 文档，因此这类部署配置 `modal`——也就是页面内方式表单，只差一个设置。为后端调用保留的登录需求会跨浏览器往返保持挂起，并由会话提交释放。

## Testing

`packages/client/ui-sdkwork-iam/tests/iam-service-browser-login.client.spec.ts` 覆盖出厂的浏览器分发、配置的 `modal` 分发、无深链桥回退、失败标记与重试、关闭取消等待、以及兑换成功后关闭卡片。`iam-deeplink-login-e2e.client.spec.ts` 用真实 `@sdkwork/iam-desktop-auth` 控制器把一次登录需求从桌面欢迎页驱动到托管页，并用真实深链完成。`sign-in-overlay.client.spec.tsx` 固定交接卡片的文案与唯一的重试动作（等待与失败两种状态）。`host.client.spec.ts` 固定新字段为实时字段且默认 `browser`。
