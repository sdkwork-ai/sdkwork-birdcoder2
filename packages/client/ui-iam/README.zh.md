# @deepseek-ai/dsh-client-ui-iam

[English](README.md) | 中文

SDKWork IAM 集成插件：通过 sdkwork-iam 认证栈提供登录/注册（全新页面与 Modal 弹窗两种形态）与退出登录，挂载为账号应用模式、设置菜单账号缝与框架浮层 Modal 宿主。

## 表面

插件贡献三块 UI 表面与一个服务缝：

- **账号模式**（`mode.page` keyed `account`）。未登录时模式页挂载 sdkwork 全页认证表面（`SdkworkAuthPage`，密码登录 + 邮箱/手机注册 + 找回密码，跟随 `ui-iam` 设置的开关）；登录后显示账号摘要（显示名、用户名、用户 ID、邮箱）与退出按钮。未配置时页面以配置提示响亮失败。该模式从设置菜单的登录手势进入，不在模式栏中。
- **Modal 登录宿主**（`shell.overlay` 条目 `iam-sign-in`）：当 `presentation` 设置为 `modal` 时，设置菜单账号缝的登录手势打开 `SdkworkSessionAuthLoginModal`；未配置 baseUrl 时打开的是配置提示，而不是认证表面。
- **设置菜单账号缝**：插件通过 `ctx.account.setSource` 替换菜单的匿名账号源——未登录时展示登录/注册行（无需任何配置），已登录时发布显示身份并启用底栏退出。
- **`ctx.iam`**：IAM 服务面——基于生成的 `@sdkwork/iam-app-sdk` 客户端的 sdkwork 认证控制器、`ui-iam` 设置镜像与登录形态分发（Modal 或页面）。

## 配置

IAM baseUrl 与租户应用 id 来自共享的 [ui-env](packages/client/ui-env/README.md) profile——活动环境的 `apiBaseUrl` 即 IAM app-api 源、`appId` 即租户应用 id；`apiBaseUrl` 为空时关闭会话恢复与认证表面（菜单的登录/注册行仍然可见，点击打开配置提示）。`ui-iam` 设置命名空间（host 侧注册在本包 node half，通过 api-proxy 的产品命名空间列表暴露给浏览器）只保留展示与登录开关：

| 字段 | 默认值 | 含义 |
|---|---|---|
| `presentation` | `modal` | 设置菜单登录的打开方式：Modal 或全页账号模式 |
| `qrLoginEnabled` | `false` | 认证表面是否提供扫码登录 |
| `oauthLoginEnabled` | `false` | 认证表面是否提供 OAuth 登录 |

会话持久化在 `localStorage` 的 `dsh.iam.session` 键下，环境报告已配置的 baseUrl 后于启动时恢复。验证码登录方式默认隐藏（harness 的 app 客户端不提供消息验证码 API）；在后端策略允许时注册与找回密码无需验证码，页面也遵循后端获取到的策略。

## 模型体验

无。登录状态是浏览器侧身份，不触及模型请求。

## 实现说明

- 运行时适配器（`iam-runtime.ts`）把 `SdkworkIamRuntimeAuthRuntimeLike` 表面映射到生成的 app 客户端（双 token 认证模式），并让客户端凭据状态与 localStorage token 存储保持同步。
- 认证表面是 sdkwork 组件；其 Tailwind 工具类来自 `apps/web` 的 Tailwind 管线（`@source` 指向 sdkwork 包，`primary-*` 别名到 harness 的 deepseek 品牌色阶）。
- 本包的 tsc 发射把 `@sdkwork/*` 解析到本地声明门面（`sdkwork-types/`）——sdkwork 源码无法可移植地发射进 `lib/types`；针对真实包的完整类型检查在 `tsconfig.tests.json`（接入 `typecheck:contracts-ready`）中运行，是门面的漂移守卫。tsdown 客户端 bundle 换用无 paths 的 tsconfig 以内联私有认证与 i18n 源码包，把 qrcode 钉到浏览器入口（其 node 渲染器会把 `fs` 拖进浏览器 bundle），并清空 sdkwork 闭包中唯一一个普通样式表（一个本 harness 从不挂载的组件错误页 css）。发布包只声明公共的 `@sdkwork/iam-app-sdk@0.1.1` 可选依赖；npm 消费者不会解析私有源码包。

## 已知限制与后续工作

- **验证码登录**——邮箱/手机验证码登录与需要验证的注册依赖消息验证码 API；harness app 客户端未暴露它，因此这些方式被隐藏或呈现后端策略的要求。
- **扫码与 OAuth 登录**——默认关闭；启用需要后端特性与提供方目录。
- **单一个人会话**——组织/登录上下文选择挑战会呈现 sdkwork 对话框，但 harness 没有租户管理；多租户流程未经测试。
