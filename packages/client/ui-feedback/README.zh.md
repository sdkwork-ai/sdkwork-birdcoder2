# @deepseek-ai/dsh-client-ui-feedback

[English](README.md) | 中文

SDKWork 反馈集成插件：设置菜单的反馈弹窗，通过 `@sdkwork/appstore-app-sdk` 组合客户端向 appstore 反馈收集端提交用户反馈（`POST /app/v3/api/appstore/catalog/feedback`，base URL 可配置，默认 `https://api.sdkwork.com`），挂载为 frame overlay 弹窗宿主。

## 表面

插件贡献一个弹窗宿主与一个服务 seam：

- **反馈弹窗**（`shell.overlay` 条目 `feedback`）：设置菜单反馈行的手势打开表单弹窗——反馈类型（问题反馈 / 功能建议 / 其他）、必填内容（≤ 4000 UTF-8 字节，与收集端限制一致）、选填联系方式、提交/取消。提交经服务发送；成功以感谢态替换表单，传输失败显示重试提示，401 响应提示先登录。未配置（空 base URL）时弹窗显示配置提示而非表单。
- **设置菜单反馈 seam**：插件通过 `ctx.feedback.setSource` 替换菜单的不可用反馈源——`available` 跟随 `ui-feedback` 设置作用域（配置了 base URL 后「反馈」行出现），`open` 经由绑定的弹窗动作分发。

## 配置

收集端 baseUrl 与 app key 来自共享的 [ui-env](packages/client/ui-env/README.md) profile：活动环境的 `apiBaseUrl` 即反馈客户端提交的 appstore app-api 来源（为空时隐藏「反馈」行，弹窗显示配置提示），`appKey` 随每次提交上报。本插件不拥有自己的设置命名空间。

## 认证

服务按环境 profile 惰性构建 appstore 客户端（环境切换时无需重载即重建）。凭据按序解析：profile 配置了静态 `accessToken` 时使用它（非交互式部署），否则使用已挂载的 ui-iam 控制器会话（`ctx.get('iam')`，绝不声明式注入）——每次提交前重新同步当前 `authToken`/`accessToken`/`refreshToken`。两者皆无时客户端不携带 token；匿名提交仍会到达收集端的认证墙，其 401 以登录提示呈现。反馈本身纯人工：从不进入 Session 日志、模型上下文或遥测。

## 实现说明

- 收集端接口是组合 `@sdkwork/appstore-app-sdk` 门面的 `client.catalog.submitFeedback({ type, content, contact?, appKey })`（`createAppStoreClient({ baseUrl, tokenManager })`）。
- 本包的 tsc emit 将 `@sdkwork/*` 解析到本地声明门面（`sdkwork-types/`）——sdkwork 源码无法可移植地发射进 `lib/types`；对真实包的完整类型检查在 `tsconfig.tests.json`（接入 `typecheck:contracts-ready`）中运行，这是门面的漂移守卫。tsdown 客户端 bundle 换入无 paths 的 tsconfig，使 bundle 内联真实包。
- appstore SDK 仅以依赖解析成员身份加入 workspace（`pnpm-workspace.yaml`），与其他 sdkwork 兄弟一致；tsdown 的显式 glob 从不构建它。

## 已知限制与后续工作

- **反馈依赖设置菜单 seam**——只有 ui-settings-menu 插件挂载反馈 seam 时「反馈」行才渲染；不含它的组合没有入口。
- **未登录提交返回 401**——弹窗提示先登录；暂无匿名反馈路径或访客身份流程。
- **不支持上传**——表单仅携带文本与联系方式；附件需要收集端未在此暴露的媒体端点。
