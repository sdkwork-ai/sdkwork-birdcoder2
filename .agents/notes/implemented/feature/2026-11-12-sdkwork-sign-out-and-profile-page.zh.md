# Agent Note: SDKWork 退出登录与「个人主页」设置页

Status: implemented

[English](2026-11-12-sdkwork-sign-out-and-profile-page.md) | 中文

## Problem

本分支的账号生命周期有两处缺口。退出登录只是一个没有确认的单次点击，且只清理本地会话：浏览器里的 SDKWork 共享账号会话仍然存活，下一次登录会跳过账号校验方式，用户以为已退出却可能被直接重新登录。设置面板也没有自己的账号页——已登录身份、所属企业、以及账号管理的入口只能从浮层菜单进入，而浮层放不下一页所需的信息量。

设置导航还以 `套餐与积分` 开头：通用位于 `order: 0`，排在 Token Plan 分区的 `-5` 之后；部署级偏好并不是用户应落到的第一页。

会话结束时取消账号相关任务仍由[账号提供方退出登录决策](../architecture/2026-09-17-account-provider-signout.zh.md)负责；本记录只覆盖 SDKWork IAM 账号会话。

## Decision

退出登录是一个以确认为先的单一动作，由所有入口共用——设置浮层的底部行、账号模式页的按钮，以及新增的「个人主页」分区。`ctx.iam.requestSignOut()` 弹出确认弹窗（`shell.overlay` 条目 `iam-sign-out`）；确认后在登录 origin 上结束托管会话，端点由 [OAuth 会话结束决策](../architecture/2026-11-22-oauth-session-end-endpoints.zh.md)拥有，随后通过认证控制器结束本地会话。无论浏览器环节结果如何，本地清理始终执行。

托管会话结束不是本插件的页面。`ui-sdkwork-iam` 用 OEM profile 的托管认证 origin 构建 URL，托管表面在 OAuth 组上提供它——桌面壳用按 OAuth 客户端 id 限定的 `<iamAuthorizeBaseUrl>/oauth/logout`，页面本地会话用 `<iamAuthorizeBaseUrl>/oauth/sign-out`。

`ui-sdkwork-iam` 发布 `profileSnapshot()`：按控制器/环境状态记忆化的单一值，携带昵称、邮箱、用户名、账号 ID、组织与租户 ID、个人/企业账号类型、环境、app id、管理中心地址与退出登录 URL。新插件 `ui-sdkwork-profile` 把该快照渲染为「个人主页」分区（order `-190`），包含 `个人` 与 `企业` 两页、共用该账号的 SDKWork 产品，以及分区自己的退出登录按钮。通用移到 `order: -200`，导航以 `通用` 开头、其后是 `个人主页`。

## Alternatives considered

**让托管页完成全部退出并重定向回应用。** 浏览器无法访问本应用的会话存储或桌面 shell，应用会一直保持登录直到访问令牌过期；深链接回传还需要为没有秘密可回传的流程再定一套回调契约。应用结束本地会话、浏览器结束共享会话，让各自负责自己拥有的部分。

**只做本地退出登录。** 本地清理会留下 SDKWork SSO 会话；下次登录静默成功，共享机器仍可被使用。本分支账号在多个 SDKWork 产品间共享，因此「退出登录」必须指该账号，而不是某一个窗口。

**在本应用内复制退出登录页。** 应用在本地拥有自己的会话并通过控制器结束它；再复刻一个托管页意味着两份会话清理逻辑，并把路由契约拆给两个所有者，因此浏览器环节仍是托管表面的职责。

**把「个人主页」内容放进设置浮层。** 浮层在指针离开时关闭，放不下账号、企业、关联产品与退出登录等多个面；这些信息属于 `settings.section`，浮层保留紧凑的账号分组。

## Consequences

- 账号会话现在按设计在两处结束：浏览器（登录 origin 上的托管会话结束）与应用（本地会话）。托管表面不提供 OAuth 会话结束端点的部署，只在应用内与服务端退出登录——这一点记录为限制，而不是假装账号已在所有地方退出。
- 确认弹窗是登录宿主之外第二个 `shell.overlay` 条目。它拥有独立的 store，避免结束会话继承登录步骤；共享成员只有打开状态，弹窗展示的账号信息来自 profile 钩子。
- `ui-sdkwork-profile` 依赖 `iam` Cordis 服务，因此没有 `ui-sdkwork-iam` 的组合不会出现账号页——该分区刻意不做成缺少服务时的死路。
- 会话结束路径只有一个发布点：`ui-sdkwork-iam` 的 `oauth-session.ts` 拥有端点与按客户端限定的查询串，OEM profile 提供登录 origin 与 OAuth 客户端 id，测试锁定两个领域的 URL。
