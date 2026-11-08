---
description: "Settings menu over the mode rail's settings gear plus the settings modal shell it owns, re-declaring every upstream settings seat so feature-owned sections mount unchanged."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-settings-menu

[English](README.md) | 中文

## 概述


模式栏设置齿轮上的设置菜单，以及它拥有的设置弹窗外壳。插件占据上游 `ui-settings-general` 曾占用的 `mode.rail.settings` 席位；web bundle patch 保留该上游行的 `id`——profile 承载的设置命名空间*就是*生效的 loader 行 id——只把它背后的实现包换成本包，因此上游外壳不会装载（其源码一行不动，上游更新不会与本表面冲突），同时本包重新声明的每个命名空间仍然可寻址；本包重新声明全部设置席位——`settings.trigger/header/action/close/section/onboarding/general.item`、根作用域的账号卡席位 `settings.menu.account`，以及六个根作用域功能弹窗席位 `settings.apiKeys`、`settings.officialAccounts`、`settings.miniPrograms`、`settings.dns`、`settings.certificates` 与 `settings.myDeployments`——各功能的分区、行与 onboarding 步骤无需改动即可挂载。

悬停（或聚焦、点击）齿轮会向右弹出菜单：顶部账户行（用户名），账户行正下方是经 `settings.menu.account` 注入的账号卡（本 fork 的用量/费用卡；席位收到 `close`，因此打开更宽表面的内容会同时收起菜单），账户 provider 发布数据时的会员/积分分组、功能分组（设置打开弹窗、角色与兴趣通过 persona seam 打开角色弹窗并显示已选角色、公众号账号打开公众号账号弹窗、小程序账号在其正下方打开小程序账号弹窗、域名管理在小程序账号下方打开域名弹窗、证书管理在域名管理下方打开证书弹窗、我的应用部署在证书管理下方打开已部署应用弹窗、中转站 API Key 管理打开中转站密钥弹窗、外观通过子菜单切换真实主题、帮助显示占位 toast、反馈通过反馈 seam 打开反馈弹窗、检查更新在 preload 表面存在时驱动桌面更新器）、底部固定的退出登录行（未登录时禁用）。菜单在指针离开宽限期、Escape、外部点击与选中行后关闭。

插件提供 `ctx.account`——快照源（`{ signedIn, username?, membership?, points? }`）加 `logout()`——`ctx.feedback`——快照源（`{ available }`）加 `open()`——以及 `ctx.persona`——快照源（`{ available, roleLabel? }`）加 `open()`。随附账户实现是匿名态：不显示账户身份头部（头部与登录/注册行互斥），会员/积分隐藏，退出登录禁用。未来账户后端在同一接口后替换实现，菜单永不改动。随附反馈实现是不可用态：「反馈」行保持隐藏，打开动作空操作。ui-sdkwork-feedback 插件在同一接口后替换该源，因此只有挂载了反馈渠道时行才出现并打开其弹窗。随附 persona 实现同样是不可用态；ui-sdkwork-persona 插件替换它，且其 disposer 在该插件卸载时恢复默认值——因此该行绝不会比它的角色弹窗活得更久。

设置弹窗是本包自己的外壳：基于 `settings.section` 账本的分区导航、基于 `settings.general.item` 的通用设置分区、loopback 的打开配置文件动作、基于 `settings.onboarding` 的 onboarding 协调器。欢迎通知确认是 host 半部自己 Config 的 volatile 字段，而 loader entry 的 id 就是设置命名空间——因此本包占据上游 `ui-settings-general` 行，该字段正落在欢迎步骤读取方所解析的那个命名空间里，已持久化的确认在切换后依然有效。

## 目录

- [Model Experience](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

## Model Experience

无，本包是纯人工设置界面与导航。外观子菜单调用 `ctx.theme.setTheme`，偏好经设置传输持久化，不触碰模型请求；账户 provider 默认匿名。

#### KV Cache effect

无；本包从不组装或发送 provider 请求。

## 已知限制与后续工作

- **匿名账户默认**——在真实账户 provider 替换 `ctx.account` 之前，不显示账户身份头部（头部与登录/注册行互斥），会员/积分隐藏，退出登录禁用。
- **帮助占位**——该行显示「即将上线」toast；尚无帮助中心。
- **反馈行由 provider 门控**——只有反馈 seam 的源报告 `available`（ui-sdkwork-feedback 插件在其配置的 base URL 上）时才渲染该行；否则保持隐藏。
- **角色行由 provider 门控**——只有 persona seam 报告 `available`（ui-sdkwork-persona 插件且其设置分区已提供并可写）时才渲染该行；行文字携带该 seam 的本地化角色名，因此本包不拥有任何角色词汇。
- **检查更新仅桌面端**——该行仅在 `window.desktopBridge.updates` 存在时渲染；web 组合隐藏。

### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

本包重新声明全部设置席位（`settings.trigger/header/action/close/section/onboarding/general.item`），各功能的分区因此无需改动即可挂载；新增席位必须沿用上游的词汇，否则既有消费方将不再挂载。`ctx.account`、`ctx.feedback` 与 `ctx.persona` 随附匿名态与不可用态实现，接口保持稳定——消费方必须同时应对两种状态，而不是假定真实后端存在；host 半部以被替换外壳的 id 注册 `ui-onboarding`，使已持久化的确认在切换后依然有效。

</details>

## 运行时不变量

不发布运行时不变量伴随检查；设置界面直接读取权威的 settings 服务分节，每个开关都通过所属能力自己校验的服务面写回；作用域一致性直接由本包的客户端行为规格测试覆盖。
