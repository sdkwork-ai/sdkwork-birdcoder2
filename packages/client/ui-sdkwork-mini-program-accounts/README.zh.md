---
description: "SDKWork 小程序账号管理插件（浏览器侧）：公众号账号下方的「小程序账号」行，以及挂载共享 @sdkwork/iam-pc-mini-program 运营面板的90% 视口弹窗，读取 IAM 后台 OAuth 资源账号面。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-mini-program-accounts

[English](README.md) | 中文

## 概述

SDKWork 小程序账号插件（浏览器侧）：在设置菜单弹出面板中注册 **小程序账号** 行（位于公众号账号正下方），并把该行打开的90% 视口的弹窗注册到根作用域的 `settings.miniPrograms` 座位。弹窗把本宿主的网关地址与 IAM 会话绑定到生成的后台客户端后，挂载共享的 `@sdkwork/iam-pc-mini-program` 运营面板——即 sdkwork-iam PC 管理端与各产品宿主共用的唯一小程序账号实现。

## 目录

- [工作原理](#how-it-works)
- [构建](#build)
- [开发说明](#dev-note)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

<a id="how-it-works"></a>
## 工作原理

- `src/client/index.ts` 注册 `miniProgram` 框架语言字典、挂载 `MiniProgramHost` 适配器、把弹窗贡献到 `settings.miniPrograms` 座位（单座；运行时授权表在 `ui-sdkwork-settings-menu` 的 `mode.rail.settings` children 中），并导入编译后的面板样式表。
- `src/client/miniProgramHost.ts` 用共享的 `ui-sdkwork-env` 网关地址和 `ui-sdkwork-iam` 会话构造一个 IAM **后台**生成客户端，并在每次读取前把会话镜像进浏览器全局 token manager；随后用 `createMiniProgramController(createMiniProgramOperatorTransport(createMiniProgramBackendOperations(client.iamOauth.iam.oauth)))` 构建共享控制器。宿主 revision 计数器在每次环境或会话切换时前进，因此环境切换后弹窗会重新读取控制器。
- `src/client/miniProgramApi.ts` 只负责生成客户端的构造；账号模型、一次性“集成 → 账号”创建、各类变更与文案都在 `@sdkwork/iam-pc-mini-program` 中。
- `src/client/MiniProgramsWorkspace.tsx` 在 `SdkworkThemeProvider` 与 `SdkworkI18nProvider`（面板自带 catalog）下挂载共享面板，并把宿主语言 id（`zh`/`en`）映射到 catalog 标签。
- `src/client/MiniProgramsModal.tsx` 是弹窗框架：判断网关地址是否已配置、是否存在 IAM 会话、工作区该渲染哪个共享控制器。关闭路径为头部按钮、遮罩点击和 Escape。账号列表、新增/编辑抽屉、删除确认与登录检测都由面板拥有；这些浮层会 portal 到 `document.body`，因此弹窗打开期间在 body 上设置 portal 标记，本插件的受作用域样式表会把它们抬到宿主层之上。
- 面板使用 IAM 仓库源码中的 Tailwind 工具类。`src/client/miniProgramView.css` 与 `tsdown.config.ts` 把这些工具类编译进插件包，并包在 `@layer dsh-sdkwork-mini-program-embed` 与 `@scope (data-mini-program-embed)` 中（对 body 上的浮层再输出一份），使共享类名既不污染宿主，也不会被其他包的副本覆盖。`src/client/embedScope.ts` 是两端共享作用域名的唯一来源。
- 国际化按归属拆分：本命名空间（`src/client/locales.ts`）只承载设置行框架文案（标题、描述、提示与登录引导），所有账号/面板文案都在 `@sdkwork/iam-pc-mini-program` 的 catalog 中，不在此重复。

<a id="build"></a>
## 构建

```sh
pnpm --filter @deepseek-ai/dsh-client-ui-sdkwork-mini-program-accounts bundle
```

<a id="dev-note"></a>
## 开发说明

弹窗仅存在于浏览器；本包 host 半部是空的 `apply`。它不运行时导入其他功能插件：共享声明只通过 `import type` 引入，运行时协作只有注入的 `env`/`iam` 服务、主题服务与 `settings.miniPrograms` 座位授权。共享面板与生成的后台客户端都私有打包，因此 Web 外壳与其他插件都不会新增模块表身份。

该界面访问 IAM **后台** OAuth API 而不是 app API：sdkwork-iam 只向 app 层提供小程序*登录*，小程序*账号管理*只存在于管理端资源账号面。后台路由自行校验 OAuth 管理权限；没有权限的登录用户会请求到 API 并在那里被拒绝，共享面板会呈现该拒绝而不是隐藏它。

由于面板是 SDKWork 应用界面，本包也是本 fork 的 Tailwind 边界：构建把共享源码编译成一张受包含的样式表，`apps/web/src/index.css` 又把该嵌入层声明在最后，因此包加载顺序不会改变渲染结果。

<a id="model-experience"></a>
## 模型体验

无。本插件只渲染浏览器侧的小程序账号管理界面，其业务 HTTP 请求与 Harness 的模型请求彼此独立。

#### KV Cache 影响

无；本包既不组装也不发送任何 provider 请求。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 共享面板以运营（operator）能力集挂载：包含登录检测、启停与删除；将来的自助模式需要改用 app 层传输，而不是后台传输。
- 后台资源账号列表没有渠道过滤，面板只读取一页最多 200 行并在客户端对 `mini_program` 行分页；超过该规模的租户需要游标分页，当前未暴露。
- 资源账号投影不包含 surface 的 `mini_program_environment` / `release_channel` 字段，因此面板只在宿主行自带时展示，且不在此编辑。
- 登录检测是异步任务；面板只报告请求已被受理（或接口返回的状态信息），不轮询后续检测结论。
- 该能力要求登录账号具备 IAM OAuth 管理权限。面板直接呈现服务端拒绝，不在本地预判权限范围。
