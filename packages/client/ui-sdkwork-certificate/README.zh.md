---
description: "SDKWork 证书管理插件（浏览器侧）：域名管理下方的「证书管理」行，以及基于 deployments app API 的90% 视口的弹窗——证书台账、以已验证域名申请、手动续期与删除。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-certificate

[English](README.md) | 中文

## 概述

SDKWork 证书管理插件（浏览器侧）：在设置菜单弹出面板中注册 **证书管理** 行（位于域名管理正下方），并把该行打开的90% 视口的弹窗注册到根作用域的 `settings.certificates` 座位。弹窗展示已登录账号的 TLS 证书，从已完成归属验证的域名申请单域名或泛域名证书，按需续期，并在行内二次确认后删除。所有操作都走 deployments app API 的 `certificate` 面，`domain` 面提供已验证域名——也就是 sdkwork-webserver 控制台读取的同一权威。

## 目录

- [工作原理](#how-it-works)
- [构建](#build)
- [开发说明](#dev-note)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

<a id="how-it-works"></a>
## 工作原理

- `src/client/index.ts` 注册 `certificate` 语言字典、挂载 `CertificateHost` 适配器，并把弹窗贡献到 `settings.certificates` 座位（单座；运行时授权表在 `ui-sdkwork-settings-menu` 的 `mode.rail.settings` children 中）。
- `src/client/certificateHost.ts` 用共享的 `ui-sdkwork-env` 网关地址和 `ui-sdkwork-iam` 会话构造一个 deployments 生成客户端，并在每次读取前把会话镜像进浏览器全局 token manager。宿主 revision 计数器在每次环境或会话切换时前进，因此环境切换后即使 readiness 仍为真，弹窗也会重新读取客户端。
- `src/client/CertificateModal.tsx` 是弹窗框架：它判断网关地址是否已配置、是否存在 IAM 会话、工作区该调用哪个客户端，然后渲染 `CertificateWorkspace`。关闭路径为头部按钮、遮罩点击和 Escape。申请证书时，从弹窗上层打开左侧抽屉。
- `src/client/CertificateWorkspace.tsx` 拥有证书台账（名称、来源、类型、覆盖域名、状态、含服务端计算剩余天数的有效期、自动续期）、申请表单、续期，以及需要行内二次确认的删除。申请表单只列出 `VERIFIED` 状态的域名，按根域名分组，并把域名行 id 作为 `domainIds` 提交。
- 申请校验位于 `src/client/certificateView.ts`：证书名称必填、至少选择一个域名、`WILDCARD` 类型只能包含泛域名、`SINGLE_DOMAIN` 类型只能包含普通域名。该辅助函数返回问题判别值，本地化文案由组件拥有。
- 国际化遵循 `sdkwork-specs`（`I18N_SPEC.md`）：所有用户可见文案都在 `src/client/locales.ts` 中（中文为键集来源，英文与键集完全对齐），明暗适配只使用随宿主主题翻转的 `--dsw-alias-*` token。

<a id="build"></a>
## 构建

```sh
pnpm --filter @deepseek-ai/dsh-client-ui-sdkwork-certificate bundle
```

<a id="dev-note"></a>
## 开发说明

弹窗仅存在于浏览器；本包 host 半部是空的 `apply`。它不运行时导入其他功能插件：共享声明只通过 `import type` 引入，运行时协作只有注入的 `env`/`iam` 服务与 `settings.certificates` 座位授权。生成的 deployments 客户端私有打包，因此 Web 外壳与其他插件都不会新增模块表身份。

<a id="model-experience"></a>
## 模型体验

无。本插件只渲染浏览器侧的证书管理界面，其业务 HTTP 请求与 Harness 的模型请求彼此独立。

#### KV Cache 影响

无；本包既不组装也不发送任何 provider 请求。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 台账读取一页 100 张证书，选择器为每个根域名读取一页 100 个域名。更大规模的租户需要游标分页，当前未暴露。
- 申请仅限已完成归属验证的域名；域名的创建与验证仍在域名管理弹窗中。自定义/上传证书材料与续期历史在此未暴露。
- 申请请求把 CA 类型与密钥算法留在文档默认值；需要测试 CA 或 ECDSA 的运营者在 sdkwork-webserver 控制台选择。
- 此处的续期是手动命令；控制面自动执行的计划续期只通过证书的 `renewalStatus` 与有效期窗口体现。
