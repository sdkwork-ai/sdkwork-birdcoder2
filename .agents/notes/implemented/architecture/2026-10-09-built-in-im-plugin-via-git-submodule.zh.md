# Agent Note: 以 Git 链接内置 IM 渠道插件

Status: implemented

[English](2026-10-09-built-in-im-plugin-via-git-submodule.md) | 中文

## 问题

产品出货的 Web 与桌面表层没有任何 IM 渠道能力。要把微信、飞书、钉钉、企业微信、QQ、Slack、Telegram、Discord、WhatsApp、iMessage 或 Matrix 接到本机 Harness，用户得自己找到 `@xmanrui/dsh-im`，执行 `dsh plugin --profile web add -w @xmanrui/dsh-im`，再重启 Host；在此之前，出货版本里根本不存在这个设置页。

要做到内置，需要同时满足三件事：插件存在于出货产物中、无需任何安装步骤即默认开启、并且每次上游发版都不必把别人的代码重新移植进本仓库。

## 决策

`@xmanrui/dsh-im` 以 `plugins/dsh-im` git 子模块的形式链接进本仓库，作为成员加入 pnpm 工作区，并由 Web bundle 自己的 patch 组合。它的任何内容都不在这里修改。

### 组合

`packages/bundle/web-app/cordis.patch.yml` 只增加一行：

```yaml
- id: xmanrui-dsh-im
  name: '@xmanrui/dsh-im'
```

这一行就是全部的集成本身。Host 半边持有全部渠道连接与投递核心，声明 `inject: ['connection', 'credentials', 'typertGateway']`，这三项 base 层与 Web 层都已提供。浏览器半边是一个普通的 `dsh.client` 包：`@deepseek-ai/dsh-client-modules` 扫描该行的清单，解析 `exports["./client"]`，把它作为 `/plugins/@xmanrui/dsh-im/client.js` 提供；插件随后只注册一个 `settings.section` 行（`order: 21`），落到 profile 实际挂载的设置外壳上，也就是本 fork 的 `ui-sdkwork-settings-menu`。`dsh-sdkwork-desktop-app` 在 `dsh-web-app` 之上打补丁，因此桌面 profile 直接继承该行，不需要第二处声明。

该插件在设计上就是黑盒：它的产物不 import 任何 `@deepseek-ai/*` 包，只通过 cordis 上下文访问 Harness。它与本仓库之间只有两个连边——上面那一行，以及依赖声明。

### 固定与更新

gitlink 固定在**上游发布标签** `v4.38.0`，而不是 `main`。上游把构建产物 `lib/index.js` 与 `lib/client.js` 一并提交，而本仓库直接运行这些产物，因此固定点必须是"标签源码与已提交构建产物一致"的那个修订——发布提交正是这样的点。`.gitmodules` 记录了 `branch = main`，`git submodule update --remote plugins/dsh-im` 用来推进固定点；语言 JSON 是运行期加载的，可以在两次发布之间合法变动，而打包进 `lib/*.js` 的内容不可以。

### 工作区成员与依赖

`plugins/*` 加入 `pnpm-workspace.yaml`。成员身份正是插件自身运行期依赖被安装的原因：多数渠道已内联进已提交的产物，但它静态 import 的连接器（`dingtalk-stream`、`imapflow`、`nodemailer`、`qrcode`、`undici`、Sharp、腾讯与企业微信 SDK）需要从 `plugins/dsh-im/node_modules` 解析。`@whiskeysockets/baileys` 在 `allowBuilds` 中被拒绝执行构建脚本：它的构建输入已经内联，而它的 `prepare` 脚本会重新编译本仓库永不运行的 TypeScript。

`plugins/*` 保持在 tsdown 构建 glob（`vendor/*`、`packages/*/*`）之外，也保持在配置目录（`packages/*/*/package.json`）之外，因此仓库构建与门禁语料都不会纳入一个自带构建流程的插件。

### 许可

成员身份会把插件的 `dependencies` 送进 `gen-third-party-notices`，而该脚本把开发者专属区域之外的每一条运行期声明都视为随包分发。这暴露出两项许可白名单尚未覆盖的条款：

- `nodemailer` 声明 `MIT-0`，现已加入 `PERMISSIVE_LICENSES`。`MIT-0` 是去掉署名条件的 MIT 授权，列入它没有放宽任何限制。
- `@tencent-connect/qqbot-connector` 声明 `UNLICENSED`，即完全不授予许可。它与 Claude Agent SDK 并列获得一条身份限定的 owner 授权，生成的声明文件把它记录为一条授权，而不是把它当作宽松条款。该授权的依据与上游自己声明文件所述的事实一致：该包在运行期从它已安装的副本加载，且本仓库构建的任何产物都不复制连接器源码。

### 命名

[命名契约](2026-08-21-sdkwork-prefix-naming-contract.zh.md)要求本 fork 自有的条目带上 `sdkwork` 标识，以便上游同步不会与之冲突。该插件既非本仓库编写也非本仓库定制：改名会破坏它自己的构建，并把每次上游更新变成一次重新移植。它改为依靠位置与 gitlink 避免上游冲突——上游没有 `plugins/` 目录，而合并无法把 gitlink 改写成别人的版本。

### 验证

`packages/bundle/web-app/tests/built-in-im.spec.ts` 断言已组合的行、被链接清单的 `dsh.client` web 声明，以及两个已构建入口产物，并证明该检查会拒绝每一种不完整形态：行缺失、行被禁用、包名不符、子模块未解析、浏览器声明丢失、产物缺失。`plugins/README.md` 记录更新流程。

## 考虑过的替代方案

**作为 registry 依赖**——直接从 npm 声明 `@xmanrui/dsh-im`，这正是 `dsh plugin add` 所做、也是上游所发布的形态。这是改动最小的方案，并且把插件的依赖闭包完全挡在本工作区之外。它输在这次集成所要解决的两件事上：固定点会是一个版本号而不是可审查的修订，插件源码也完全不在仓库里，紧急修复只能等上游发版。npm 方案同样没有绕开许可问题——同一个 `UNLICENSED` 包仍会随 tarball 到来，只是声明责任落在上游而不是我们。

**按 `vendor/` 的方式源码内置**——照 Cordis 各包的做法。vendored 条目会被改写到 `@deepseek-ai/*` 作用域、是 tsdown 构建目标，并针对固定的上游提交维护一份本地改动记录。外来包一旦改写作用域就会破坏自身构建与上游身份，而内置意味着每次发版都要手工合并。

**复制进 `packages/client/ui-sdkwork-im`**——表面上满足命名契约。这会把插件变成一个 fork 自有包，每次上游改动都成为手工重新移植，而这正是本决策要避免的代价。

**用 `scripts/sdkwork-sources.manifest.json` 固定为兄弟检出**——SDKWork 兄弟仓库现用的机制。它的组合 action 硬编码 `https://github.com/sdkwork-ai/<name>.git` 并校验 `^sdkwork-[a-z0-9-]+$`，第三方仓库无法表达成一行。

**不做工作区成员、只用 `link:` 依赖**——可以让插件不进工作区图。代价是插件的依赖一个都不会安装，于是所有在运行期加载连接器的渠道都会失败：表面上内置，实际上是坏的。

## 影响

设置表层、全部十三个渠道以及 AI Office 连接器都出现在出货产物中，无需安装步骤；上游发版变成一次固定点提升加一次锁文件刷新。

代价是每次检出 `pnpm install` 都要安装该插件的闭包（约 106 个包），而且其中一个是 `UNLICENSED`：这条授权是一条被记录下来的决定，不是被消除的风险，该包升版本会重新打开这个问题。所有会安装或构建工作区的 workflow 检出都必须带 `submodules: recursive`；漏掉的作业会看到空的 `plugins/dsh-im`，从而在工作区解析阶段失败，而不是静默跳过插件。

固定点是手工维护的。本仓库没有任何机制会察觉上游发布了新版本，而过期的固定点会静默地出货旧插件——对策是 `plugins/README.md` 中规定的固定点复查，而不是某道门禁。
