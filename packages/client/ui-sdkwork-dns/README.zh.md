---
description: "SDKWork 域名管理插件（浏览器侧）：公众号账号下方的「域名管理」行，以及基于 deployments app API 的90% 视口的弹窗——根域名、子域名归属验证与 DNS 解析记录。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-dns

[English](README.md) | 中文

## 概述

SDKWork 域名管理插件（浏览器侧）：在设置菜单弹出面板中注册 **域名管理** 行（位于公众号账号正下方），并把该行打开的90% 视口的弹窗注册到根作用域的 `settings.dns` 座位。弹窗管理已登录账号的根域名（Zone）、其子域名与归属验证，以及从根域名云账号同步的 DNS 解析记录。所有操作都走 deployments app API 的 `domain` 面（`@sdkwork/deployments-app-sdk`）——也就是 sdkwork-webserver 控制台读取的同一权威——不引入第二套后端契约。

## 目录

- [工作原理](#how-it-works)
- [构建](#build)
- [开发说明](#dev-note)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

<a id="how-it-works"></a>
## 工作原理

- `src/client/index.ts` 注册 `dns` 语言字典、挂载 `DnsHost` 适配器，并把弹窗贡献到 `settings.dns` 座位（单座；运行时授权表在 `ui-sdkwork-settings-menu` 的 `mode.rail.settings` children 中）。
- `src/client/dnsHost.ts` 用共享的 `ui-sdkwork-env` 网关地址和 `ui-sdkwork-iam` 会话构造一个 deployments 生成客户端，并在每次读取前把会话镜像进浏览器全局 token manager。宿主 revision 计数器在每次环境或会话切换时前进，因此环境切换后即使 readiness 仍为真，弹窗也会重新读取客户端。
- `src/client/DnsModal.tsx` 是弹窗框架：它判断网关地址是否已配置、是否存在 IAM 会话、工作区该调用哪个客户端，然后渲染 `DnsWorkspace`。关闭路径为头部按钮、遮罩点击和 Escape。新增根域名、子域名或解析记录时，从弹窗上层打开左侧抽屉。
- `src/client/DnsWorkspace.tsx` 拥有根域名台账（`scope: USER`，因此平台的 `app.<suffix>` 区域不会被当作「我的根域名」）、新增表单（根域名、可选备注、DNS 服务商、云账号）、暂停/启用，以及需要行内二次确认的删除。它把选中的根域名交给 `ZoneDetail`。
- `src/client/ZoneDetail.tsx` 拥有单个根域名的子域名台账（新增、验证、删除）和 DNS 解析台账（从云账号同步、新增、暂停/恢复、删除）。验证指引按 API 返回原样展示 TXT 记录名与证明值。
- `src/client/dnsView.ts` 承载纯函数校验（ASCII/IDN 根域名、仅允许最左一个通配标签的区域相对名、允许 `@` 的记录 owner、TTL 与优先级解析）以及与语言无关的时间格式化，使组件测试无需渲染树即可断言可接受的值形状。
- 国际化遵循 `sdkwork-specs`（`I18N_SPEC.md`）：所有用户可见文案都在 `src/client/locales.ts` 中（中文为键集来源，英文与键集完全对齐），明暗适配只使用随宿主主题翻转的 `--dsw-alias-*` token。

<a id="build"></a>
## 构建

```sh
pnpm --filter @deepseek-ai/dsh-client-ui-sdkwork-dns bundle
```

<a id="dev-note"></a>
## 开发说明

弹窗仅存在于浏览器；本包 host 半部是空的 `apply`。它不运行时导入其他功能插件：共享声明只通过 `import type` 引入，运行时协作只有注入的 `env`/`iam` 服务与 `settings.dns` 座位授权。生成的 deployments 客户端私有打包，因此 Web 外壳与其他插件都不会新增模块表身份。

<a id="model-experience"></a>
## 模型体验

无。本插件只渲染浏览器侧的域名管理界面，其业务 HTTP 请求与 Harness 的模型请求彼此独立。

#### KV Cache 影响

无；本包既不组装也不发送任何 provider 请求。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 每个列表只读取一页 100 行（根域名、子域名、解析记录）。超过该规模的租户需要游标分页，当前未暴露。
- 本界面不含云账号创建：新增根域名时只能选择云账号中心已有的账号，且服务会拒绝没有凭据的账号。凭据本身的登记与轮换仍在账号中心完成。
- DNS 记录支持新增、删除与暂停/恢复；整条替换（`PATCH`）与微信公众平台域名归属验证文件流程尚未暴露。
- 服务只允许删除空根域名；弹窗直接呈现服务端拒绝，而不是先检查子域名数量。
