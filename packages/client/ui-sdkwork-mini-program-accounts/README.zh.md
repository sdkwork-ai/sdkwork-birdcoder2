---
description: "SDKWork 小程序账号管理插件（浏览器侧）：公众号账号下方的「小程序账号」行，以及基于 IAM 后台 OAuth 资源账号接口的90% 视口的弹窗——AppID/AppSecret 录入、编辑、启停、删除与登录检测。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-mini-program-accounts

[English](README.md) | 中文

## 概述

SDKWork 小程序账号插件（浏览器侧）：在设置菜单弹出面板中注册 **小程序账号** 行（位于公众号账号正下方），并把该行打开的90% 视口的弹窗注册到根作用域的 `settings.miniPrograms` 座位。弹窗管理租户的微信小程序账号——录入 AppID 与 AppSecret、编辑名称与凭据、启停、删除以及后台登录检测——读取的正是 sdkwork-iam PC 管理端小程序账号页所管理的 IAM 后台 OAuth 资源账号面。

## 目录

- [工作原理](#how-it-works)
- [构建](#build)
- [开发说明](#dev-note)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

<a id="how-it-works"></a>
## 工作原理

- `src/client/index.ts` 注册 `miniProgram` 语言字典、挂载 `MiniProgramHost` 适配器，并把弹窗贡献到 `settings.miniPrograms` 座位（单座；运行时授权表在 `ui-sdkwork-settings-menu` 的 `mode.rail.settings` children 中）。
- `src/client/miniProgramHost.ts` 用共享的 `ui-sdkwork-env` 网关地址和 `ui-sdkwork-iam` 会话构造一个 IAM **后台**生成客户端，并在每次读取前把会话镜像进浏览器全局 token manager。宿主 revision 计数器在每次环境或会话切换时前进，因此环境切换后弹窗会重新读取客户端。
- `src/client/miniProgramApi.ts` 对齐 sdkwork-iam 管理端的账号流程：读取 `mini_program` 资源账号行；创建账号时复用（或创建）其 `wechat_mini_program` 登录集成，并拒绝重复 AppID；账号与集成一起启停；删除时只删账号行；提交后台小程序登录检测；并在 AppSecret 留空时保持原凭据不变地轮换 AppID/AppSecret。
- `src/client/MiniProgramsWorkspace.tsx` 拥有账号台账、新增表单（AppID、AppSecret、显示名称、启用）、编辑表单、状态切换、行内二次确认删除与登录检测提示。
- `src/client/MiniProgramsModal.tsx` 是弹窗框架：判断网关地址是否已配置、是否存在 IAM 会话、工作区该调用哪个客户端。关闭路径为头部按钮、遮罩点击和 Escape。新增或编辑账号时，从弹窗上层打开左侧抽屉。
- 国际化遵循 `sdkwork-specs`（`I18N_SPEC.md`）：所有用户可见文案都在 `src/client/locales.ts` 中（中文为键集来源，英文与键集完全对齐），明暗适配只使用随宿主主题翻转的 `--dsw-alias-*` token。

<a id="build"></a>
## 构建

```sh
pnpm --filter @deepseek-ai/dsh-client-ui-sdkwork-mini-program-accounts bundle
```

<a id="dev-note"></a>
## 开发说明

弹窗仅存在于浏览器；本包 host 半部是空的 `apply`。它不运行时导入其他功能插件：共享声明只通过 `import type` 引入，运行时协作只有注入的 `env`/`iam` 服务与 `settings.miniPrograms` 座位授权。生成的后台客户端私有打包，因此 Web 外壳与其他插件都不会新增模块表身份。

该界面访问 IAM **后台** OAuth API 而不是 app API：sdkwork-iam 只向 app 层提供小程序*登录*，小程序*账号管理*只存在于管理端资源账号面。后台路由自行校验 OAuth 管理权限；没有权限的登录用户会请求到 API 并在那里被拒绝。

<a id="model-experience"></a>
## 模型体验

无。本插件只渲染浏览器侧的小程序账号管理界面，其业务 HTTP 请求与 Harness 的模型请求彼此独立。

#### KV Cache 影响

无；本包既不组装也不发送任何 provider 请求。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 台账只读取一页最多 200 条资源账号并在本地筛选 `mini_program` 行；超过该规模的租户需要游标分页，当前未暴露。
- 管理端页面的完整开发者配置——自定义/合法请求域名、微信域名归属校验文件、Logo 上传——暂未暴露。当前表单覆盖让登录可用的账号身份与凭据。
- 登录检测是异步任务；本弹窗只确认请求已被受理，不轮询也不展示检测结论。
- 该能力要求登录账号具备 IAM OAuth 管理权限。弹窗直接呈现服务端拒绝，不在本地预判权限范围。
