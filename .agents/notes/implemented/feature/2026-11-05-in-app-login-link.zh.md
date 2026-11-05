# Agent Note: 产品登录入口的内置弹窗登录链接

Status: implemented

[English](2026-11-05-in-app-login-link.md) | 中文

## Problem

[可配置的登录手势](2026-11-04-configurable-login-gesture.zh.md) 把托管 OAuth 页面设为产品登录入口“登录”按钮的出厂手势。该手势要求租户应用完成 OAuth relying party 注册，而且它在系统浏览器里完成，应用观察不到任何东西：未注册的租户在应用看不到的页面里得到 `invalid_client`，交接卡片只是一直等待。文档化的退出方式是 `signInMethod: modal`，但那是 Host 设置——站在登录表面前的用户改不了它，入口也没有第二条路。于是浏览器登录无法完成的用户（注册未应用、浏览器被拦截、深链丢失）在刚刚要求他登录的这个表面上，没有任何进入页面内账号方式的途径。

## Decision

- 当浏览器交接拥有“登录”时，入口在操作列下方保留一个安静的**内置弹窗登录**动作（英文：In-app sign-in）。它通过 `IamService.openSignInMethods()` 唤起与 `modal` 设置相同的 `SdkworkSessionAuthLoginModal`，因此交接前的登录方式无需改设置即可触达。
- 链接的显示条件与选择手势的是同一个事实。`IamService.usesBrowserHandoff()` 即 `signInMethod === 'browser'` 且页面带有桌面深链桥；`startSignIn()` 经由该方法分发，浮层通过 `browserHandoff` 注入 hook 读取同一判据，所以一个谓词同时决定了手势与链接的可见性。当“登录”本身就会唤起页面内表单时（配置 `modal`，或页面没有深链桥），链接不显示，避免重复按钮。
- 该链接是一个普通的 `kind: 'text'` `LoginAction`，复用共享 `LoginPanel` 的安静动作处理：不新增组件，也不新增文案样式。其 CSS 改为让安静动作跟随最后一个按钮（在操作列内正常流动，而不再锚定在固定操作带下方）。两个按钮占满操作列时像素位置与改动前完全一致（即桌面欢迎窗的 API Key 页）；只有一个按钮时，链接保持一个 16px 节奏步长贴在按钮下方，而不是被丢到卡片底部。

## Alternatives considered

**把 `signInMethod` 改为 `modal`。** 不予采纳：手势是部署决定，对已完成注册的租户也是正确选择；而用户眼前的失败是局部且即时的，让他去改 Host 设置才能回到应用，并不构成恢复路径。

**无条件显示该链接。** 不予采纳：在纯浏览器页面或配置 `modal` 时，“登录”已经唤起账号表单，第二个入口只会重复第一个而不增加能力。

**把回退放在浏览器交接卡片上。** 不予采纳：卡片只在托管页正在打开时可见。用户遇到的失败发生在之后——托管页返回错误，或浏览器在加载任何页面之前就被拦截——而重新打开卡片仍要经过入口。选择发生在入口，因此替路应当与选择浏览器的手势放在一起。

**把链接做成第二个 `secondary` 按钮。** 不予采纳：两个同权重按钮等于让用户在两种登录机制之间做选择，而那是产品的决定；安静动作把页面内表单表达为它本来的回退身份。

## Consequences

托管登录无法完成的部署，其用户仍可在应用内登录；对完成客户端注册的租户，浏览器手势仍是主路径。入口只在浏览器交接状态多出一行，因此纯浏览器 Web 产品与 `modal` 部署的渲染与之前完全一致。代价是同一表面上出现第二种登录机制：部署不能再声称 `browser` 下页面内表单不可达，而支持文案现在有了可以指向的真实控件。

## Testing

`sign-in-overlay.client.spec.tsx` 固定在 `browserHandoff` 下出现的链接、缺省时的缺席、点击调用的手势，以及“登录”仍执行配置手势。`iam-service-browser-login.client.spec.ts` 覆盖出厂默认、`modal`、无深链桥三种状态下的 `usesBrowserHandoff()`，以及 `openSignInMethods()` 直接唤起账号表单。`ui-primitives` 的 `LoginPanel` 规格覆盖安静动作；桌面欢迎窗的 API Key 页渲染在 CSS 改动前后逐像素比对一致。入口在两种主题的 600×700 与受限的 460px 视口下都已检查；长文案依赖未改动的 `nowrap` 处理。
