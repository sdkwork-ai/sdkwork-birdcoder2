# Agent Note：设置菜单反馈弹窗对接 appstore 反馈收集端

Status: implemented

[English](2026-08-16-settings-menu-feedback-dialog.md) | 中文

## 问题

设置菜单的「帮助和反馈」行只是占位 toast（[settings-menu-popover note](2026-08-16-settings-menu-popover.md) 的已知限制）：没有反馈渠道。产品要求真实的反馈流程——在设置菜单点击「反馈」弹出弹窗，向 sdkwork 平台提交用户反馈，平台 API 网关为 `api.sdkwork.com`。

## 决策

新插件包 `ui-sdkwork-feedback`（`@deepseek-ai/dsh-client-ui-sdkwork-feedback`）实现该渠道，设置菜单将「帮助和反馈」拆为「帮助」（toast）与「反馈」（弹窗），后者走新 seam：

- **反馈 seam，账户式**。`ui-sdkwork-settings-menu` 提供 `ctx.feedback`（`FeedbackRuntime`）：快照源（`{ available }`）加 `open()`。随附 provider 是不可用态——行保持隐藏，打开空操作。`ui-sdkwork-feedback` 通过 `ctx.feedback.setSource` 替换该源（与 ui-sdkwork-iam 账户 seam 相同的绑定模式），因此无论是否挂载渠道，菜单只消费一个快照契约；web bundle 通过组合插件决定。
- **收集端是 sdkwork 现有模块**。sdkwork-space 中唯一的 feedback 实现在 appstore：`sdkwork-appstore` 的组合 SDK（`@sdkwork/appstore-app-sdk`）暴露 `client.catalog.submitFeedback({ type, content, contact?, appKey })`，对应 `POST /app/v3/api/appstore/catalog/feedback`，需要 AuthToken/AccessToken。插件引入该 SDK，并以新 `ui-sdkwork-feedback` 设置命名空间的 `baseUrl`（默认 `https://api.sdkwork.com`）与 `appKey`（默认 `sdkwork-birdcoder`，与 ui-sdkwork-iam 的 app id 一致）配置。appstore SDK 以依赖解析兄弟成员身份加入 harness workspace（`pnpm-workspace.yaml`），与其他 sdkwork 成员一致。
- **token 来自已挂载的 IAM 会话**。服务读取 `ctx.get('iam')`（绝不声明式注入），使 appstore 客户端的 token 管理器与 ui-sdkwork-iam 控制器的会话保持同步——每次提交前重新同步 `authToken`/`accessToken`/`refreshToken`。未挂载 ui-sdkwork-iam 时客户端不携带 token；收集端的 401 以弹窗的登录提示呈现。
- **弹窗是 frame overlay 宿主**。`ui-sdkwork-feedback` 注册 `shell.overlay` 条目 `feedback` 并自带 store（与 ui-sdkwork-iam 的 `iam-sign-in` 相同的宿主形态）：类型组（问题反馈 / 功能建议 / 其他）、必填内容（≤ 4000 UTF-8 字节，收集端限制）、选填联系方式、提交/取消、成功与错误态。未配置（空 base URL）时显示配置提示，手势总是落入弹窗。
- **SDK 类型卫生沿用 ui-sdkwork-iam**。emit 项目将 `@sdkwork/*` 解析到本地声明门面（`sdkwork-types/`）；`tsconfig.tests.json` 对真实 sdkwork 源码做完整类型检查，作为门面的漂移守卫；tsdown bundle 换入无 paths 的 tsconfig 以内联真实包。

## 备选方案

| 拒绝 | 一句话理由 |
|---|---|
| 弹窗直接做进 ui-sdkwork-settings-menu | 菜单外壳会依赖特性 provider，破坏插件边界；seam 使特性与外壳解耦 |
| 不用 SDK 手写 POST | sdkwork-space 的 appstore SDK 已实现端点契约、认证头与错误信封；手写重复已拥有代码 |
| 直接读 localStorage 的 IAM 会话 | 重复 ui-sdkwork-iam 的存储键；controller 状态是拥有的、带类型的表面 |

## 后果

设置菜单新增 provider 门控的「反馈」行，`ui-sdkwork-feedback` 拥有完整反馈表面（设置作用域、SDK 客户端、弹窗、seam 绑定）。「帮助和反馈」文案拆二，因此菜单金样（`settings-chrome/menu.expected.md`）与 settings-menu e2e 同步更新。成本：appstore SDK 新增一个仅依赖解析的 workspace 兄弟（绝非构建目标），浏览器 bundle 闭包因组合 appstore 客户端而增大。

## 测试

包内规格覆盖服务（设置镜像、惰性客户端重建、空白/trim 校验、脚本化 IAM 控制器的 token 同步）、弹窗（表单渲染、校验、提交/成功/错误/401、关闭）、插件注册与 seam 绑定、host 设置注册。e2e 层：settings-menu e2e 断言「反馈」行并打开/关闭弹窗，settings-chrome 菜单金样新增该行。
