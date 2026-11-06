# Agent Note：以两个设置菜单插件承载域名与证书管理

Status: implemented

[English](2026-11-06-domain-and-certificate-settings-plugins.md) | 中文

## 问题

设置菜单已有账户（公众号账号）与中转站凭据，但部署的公开面——承载已发布应用的根域名、已归属验证的子域名、其下的 DNS 解析记录，以及这些名字所需的 TLS 证书——在 BirdCoder 中没有入口。该权威已经存在：sdkwork-webserver 控制台读取 deployments app API 的 `domain` 与 `certificate` 面，而本 fork 的部署发布已经依赖 `@sdkwork/deployments-app-sdk`。因此新界面必须出现在公众号账号下方，同时不引入第二套后端契约、不引入外部控制台页面，也不让两个能力互相依赖。

## 决定

两个独立的浏览器侧插件承载界面：`ui-sdkwork-dns`（域名管理）与 `ui-sdkwork-certificate`（证书管理）。每个包拥有自己的设置行、80vw 弹窗框架、工作区、语言命名空间和自己的宿主适配器。适配器只共享形状而不共享代码：各自用共享的 `ui-sdkwork-env` 网关地址和 `ui-sdkwork-iam` 会话构造一个 deployments 生成客户端，在每次读取前把会话镜像进浏览器全局 token manager，并发布 revision，使环境切换时客户端重建而弹窗仍保持挂载。

设置菜单外壳拥有可见性。`ui-settings` 声明两个新的根作用域功能弹窗座位 `settings.dns` 与 `settings.certificates`；外壳在 `mode.rail.settings` 的 children 表中授权它们，并由插在账号行下方的两行切换。已注册的行保持公开面顺序：公众号账号、小程序账号、域名管理、证书管理，然后是中转站 API Key 行。插件只通过 `ctx.slots.inject` 接触外壳；彼此不导入，也不以值的方式导入设置菜单包。

能力本身是 deployments app API，而不是新的 Host 面。DNS 使用 `domain.domainZones`（根域名、子域名、归属声明/验证、DNS 记录、云账号）；证书使用 `certificate`（台账、申请、续期、删除）以及 `domain` 返回的已验证子域名。申请时以子域名行 id 作为 `domainIds` 提交，与该权威自己的控制台一致。

## 考虑过的替代方案

**直接嵌入 deployments PC 控制台页面。** `DomainManagementPage` 与 `CertificateManagementPage` 确实存在于 `@sdkwork/deployments-pc-console-delivery`，但它们是私有控制台包，依赖路由、控制台全局样式与控制台页面框架。在 80vw 弹窗中挂载它们会让 BirdCoder 耦合到并不拥有的控制台布局，而且仍需要控制台服务 provider。

**合并为一个带两个标签页的插件。** 需求点名两个插件，两个能力有各自的失败模式、语言命名空间与宿主操作；单个弹窗还会让证书选择器受域名台账加载状态牵制。

**经 Host 代理。** Host 服务会在同一权威之上再加一套契约，并在没有消费者需要的情况下把凭据处理搬进 Host。现有的 environment/IAM 服务已经提供了到浏览器的传输接缝。

## 影响

- `packages/client/ui-settings` 拥有两个座位声明；`ui-sdkwork-settings-menu` 拥有授权、行与弹窗挂载。两个插件在各自的套件中保持源码 100% 覆盖，`apps/web/tests/settings-menu.e2e.ts` 在真实 Web 组合中证明两行与两个弹窗都能打开。
- 两个弹窗的列表都只读取一页 100 行；分页、云账号登记、DNS 记录整条替换（`PATCH`）与微信验证文件流程暂时仍留在 sdkwork-webserver 控制台。
- 渲染结果已用浏览器 e2e 验证菜单行与弹窗框架（脚手架处于未登录态，因此弹窗展示登录门槛）；登录后的工作区由针对生成客户端形状的组件测试覆盖，尚未记录针对真实网关的登录后可视化验证。
