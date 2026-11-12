# Agent Note: SDKWork 退出登录与「个人主页」设置页

Status: implemented

[English](2026-11-12-sdkwork-sign-out-and-profile-page.md) | 中文

## Problem

本分支的账号生命周期有两处缺口。退出登录只是一个没有确认的单次点击，且只清理本地会话：浏览器里的 SDKWork 共享账号会话仍然存活，下一次登录会跳过账号校验方式，用户以为已退出却可能被直接重新登录。设置面板也没有自己的账号页——已登录身份、所属企业、以及账号管理的入口只能从浮层菜单进入，而浮层放不下一页所需的信息量。

设置导航还以 `套餐与积分` 开头：通用位于 `order: 0`，排在 Token Plan 分区的 `-5` 之后；部署级偏好并不是用户应落到的第一页。

会话结束时取消账号相关任务仍由[账号提供方退出登录决策](../architecture/2026-09-17-account-provider-signout.zh.md)负责；本记录只覆盖 SDKWork IAM 账号会话。

## Decision

退出登录是一个以确认为先的单一动作，由所有入口共用——设置浮层的底部行、账号模式页的按钮，以及新增的「个人主页」分区。`ctx.iam.requestSignOut()` 弹出确认弹窗（`shell.overlay` 条目 `iam-sign-out`）；确认后在系统浏览器打开 CloudRouter 托管的退出登录页 `<cloudRouterUrl>/auth/sign-out`（桌面端经 `sdkworkDesktop.shellOpen` 桥，普通网页开新标签页），随后通过认证控制器结束本地会话。当环境配置把 `cloudRouterUrl` 留空时跳过浏览器环节；本地清理始终执行。

托管页本身在 `sdkwork-iam`（`@sdkwork/auth-pc-react`）中实现：`auth-sign-out.ts` 拥有路由段与路径/URL 构造函数，`SdkworkAuthSignOutPage` 由 `SdkworkIamAuthRoutes` 挂载在 `<basePath>/sign-out`。CloudRouter 应用拥有它实际提供的 URL 路径（`PORTAL_AUTH_SIGN_OUT_PATH = '/auth/sign-out'`），并把该路由从「已登录访问认证区即重定向」中豁免，因为只有已登录访客才能结束会话，把他们重定向回家会让退出登录不可达。

`ui-sdkwork-iam` 发布 `profileSnapshot()`：按控制器/环境状态记忆化的单一值，携带昵称、邮箱、用户名、账号 ID、组织与租户 ID、个人/企业账号类型、环境、app id、管理中心地址与退出登录 URL。新插件 `ui-sdkwork-profile` 把该快照渲染为「个人主页」分区（order `-190`），包含 `个人` 与 `企业` 两页、共用该账号的 SDKWork 产品，以及分区自己的退出登录按钮。通用移到 `order: -200`，导航以 `通用` 开头、其后是 `个人主页`。

## Alternatives considered

**让托管页完成全部退出并重定向回应用。** 浏览器无法访问本应用的会话存储或桌面 shell，应用会一直保持登录直到访问令牌过期；深链接回传还需要为没有秘密可回传的流程再定一套回调契约。应用结束本地会话、浏览器结束共享会话，让各自负责自己拥有的部分。

**只做本地退出登录。** 本地清理会留下 SDKWork SSO 会话；下次登录静默成功，共享机器仍可被使用。本分支账号在多个 SDKWork 产品间共享，因此「退出登录」必须指该账号，而不是某一个窗口。

**从 BirdCoder 源站提供退出登录页。** BirdCoder 的源站不提供 IAM 认证路由；只有 CloudRouter 门户挂载共享认证包。复制该页面意味着第二份会话清理逻辑和第二条需要同步的路由契约。

**把「个人主页」内容放进设置浮层。** 浮层在指针离开时关闭，放不下账号、企业、关联产品与退出登录等多个面；这些信息属于 `settings.section`，浮层保留紧凑的账号分组。

## Consequences

- 账号会话现在按设计在两处结束：浏览器（共享会话）与应用（本地会话）。未配置 CloudRouter 源站的部署只做本地退出登录——这一点记录为限制，而不是假装账号已在所有地方退出。
- 确认弹窗是登录宿主之外第二个 `shell.overlay` 条目。它拥有独立的 store，避免结束会话继承登录步骤；共享成员只有打开状态，弹窗展示的账号信息来自 profile 钩子。
- `ui-sdkwork-profile` 依赖 `iam` Cordis 服务，因此没有 `ui-sdkwork-iam` 的组合不会出现账号页——该分区刻意不做成缺少服务时的死路。
- CloudRouter 路径在每个仓库只有一个发布点：IAM 包拥有路由段与 URL 构造函数，CloudRouter 拥有挂载路径与认证区豁免，BirdCoder 从环境配置读取源站。各仓库的测试固定同一路径。
