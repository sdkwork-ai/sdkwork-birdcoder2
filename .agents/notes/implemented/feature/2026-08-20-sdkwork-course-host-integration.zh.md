# Agent Note：SDKWork Course 宿主集成

Status: implemented

[English](2026-08-20-sdkwork-course-host-integration.md) | 中文

## 问题

Course 侧栏入口需要在 BirdCoder 内打开现有 SDKWork Course PC 应用。该应用需要生成的 Course app client、session 与 locale ports 以及 Tailwind 输出，而 BirdCoder 已拥有部署、认证、locale、导航状态，以及按插件评估单个浏览器闭包的 client loader。

## 决策

`@deepseek-ai/dsh-client-ui-course` 是 app-mode rail 中的独立模式插件。其入口调用 layout store 现有的 `setMode('course')` 动作，keyed `mode.page` 注册在中栏挂载 SDKWork 应用。该模式是 transient layout state：Course 导航既不增加 browser route，也不写入持久化 BirdCoder 偏好。

`@deepseek-ai/dsh-client-ui-course` 内的 `courseHost.ts` 模块拥有 SDKWork 宿主适配。插件在注册页面前，从现有 `ctx.env`、`ctx.iam`、`ctx.locale` 与 `ctx.theme` 服务配置它。适配器按当前 API base URL 惰性构造生成的 Course client，通过共享 SDKWork token manager 同步 IAM 凭证，将宿主用户 profile 字段映射到 Course session snapshot，并在 API 环境变更时 remount `CourseView`。Locale 变更通过 SDKWork 订阅传播，无需 remount。

`CourseApp` 以 environment revision 为 key 挂载 SDKWork `CourseView`。`@sdkwork/course-pc-course` 通过 `configureCoursePcRuntime` 读取 host ports（`getCourseClient`、`readHostSession`、`subscribeHostSession`、`resolveHostLanguage`、`subscribeHostLanguage`）。

## 类型与 bundle 集成

该包遵循与 `@deepseek-ai/dsh-client-ui-drive` 相同的拆分：declaration emit 跳过对 sibling SDKWork 实现的严格检查，`tsconfig.tests.json` 以单一 React 类型身份编译所消费的 SDKWork 源码闭包。

浏览器 build 输出一个 tree-shaken `client.js` 闭包。bundle 面从 `sdkwork-course-pc` 源码编译 SDKWork Tailwind 样式表，并幂等注入样式。

## 已否决方案

| 否决 | 原因 |
|---|---|
| 增加 URL 路由或持久化 Course 模式 | layout store 已拥有模式选择 |
| 引入 Course 专用 auth 或 environment store | `ui-env` 与 `ui-iam` 已拥有这些事实 |
| 从 `CoursePage` 直接 import SDKWork 内部实现 | 页面将拥有 generated-client 与 session 适配细节 |
| 输出多个 browser chunk | BirdCoder 仅提供已注册的 plugin `client.js` |

## 后果

点击 Course 侧栏图标会用真实 SDKWork Course 表面替换 Code 对话；返回 Code 会恢复 workbench。SDKWork 业务 HTTP 请求仍是 browser traffic，不增加 Harness prompt 内容、工具、session 事件或 KV Cache 输入。

集成需要 `../sdkwork-course` sibling checkout 与 generated clients。Course PC runtime ports 是进程全局的，因此一个 browser window 只有一个活跃 SDKWork Course host adapter。

## 验证

Facade tests 固定 session 映射、locale、environment-revision 与 disposal 行为；integration spec 在 jsdom 中配置真实 host adapter 并挂载 SDKWork 表面。Plugin tests 固定 declared injection、keyed registration、teardown 与 SDKWork page marker。assembled web mode test 依次点击 Knowledge、Course、Drive 入口，验证每个 SDKWork 页面替换对话。SDKWork source-check project 与 bundle inspection 固定真实源码闭包、单文件输出与编译后的 Tailwind 样式。
