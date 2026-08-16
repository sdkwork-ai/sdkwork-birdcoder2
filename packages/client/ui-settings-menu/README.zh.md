# @deepseek-ai/dsh-client-ui-settings-menu

[English](README.md) | 中文

模式栏设置齿轮上的设置菜单，以及它拥有的设置弹窗外壳。插件占据上游 `ui-settings-general` 曾占用的 `mode.rail.settings` 席位；web bundle patch 在组合层面禁用该上游行（其源码一行不动，上游更新不会与本表面冲突），本包重新声明全部设置席位——`settings.trigger/header/action/close/section/onboarding/general.item`——各功能的分区、行与 onboarding 步骤无需改动即可挂载。

悬停（或聚焦、点击）齿轮会向右弹出菜单：顶部账户行（用户名）、账户 provider 发布数据时的会员/积分分组、功能分组（设置打开弹窗、外观通过子菜单切换真实主题、帮助显示占位 toast、反馈通过反馈 seam 打开反馈弹窗、检查更新在 preload 表面存在时驱动桌面更新器）、底部固定的退出登录行（未登录时禁用）。菜单在指针离开宽限期、Escape、外部点击与选中行后关闭。

插件提供 `ctx.account`——快照源（`{ signedIn, username?, membership?, points? }`）加 `logout()`——以及 `ctx.feedback`——快照源（`{ available }`）加 `open()`。随附账户实现是匿名态：不显示账户身份头部（头部与登录/注册行互斥），会员/积分隐藏，退出登录禁用。未来账户后端在同一接口后替换实现，菜单永不改动。随附反馈实现是不可用态：「反馈」行保持隐藏，打开动作空操作。ui-feedback 插件在同一接口后替换该源，因此只有挂载了反馈渠道时行才出现并打开其弹窗。

设置弹窗是本包自己的外壳：基于 `settings.section` 账本的分区导航、基于 `settings.general.item` 的通用设置分区、loopback 的打开配置文件动作、基于 `settings.onboarding` 的 onboarding 协调器。host 半部以与被替换外壳相同的 id 注册 `ui-onboarding` 设置命名空间（欢迎通知确认），已持久化的确认在切换后依然有效。

## Model Experience

无，本包是纯人工设置界面与导航。外观子菜单调用 `ctx.theme.setTheme`，偏好经设置传输持久化，不触碰模型请求；账户 provider 默认匿名。

#### KV Cache effect

无；本包从不组装或发送 provider 请求。

## 已知限制与后续工作

- **匿名账户默认**——在真实账户 provider 替换 `ctx.account` 之前，不显示账户身份头部（头部与登录/注册行互斥），会员/积分隐藏，退出登录禁用。
- **帮助占位**——该行显示「即将上线」toast；尚无帮助中心。
- **反馈行由 provider 门控**——只有反馈 seam 的源报告 `available`（ui-feedback 插件在其配置的 base URL 上）时才渲染该行；否则保持隐藏。
- **检查更新仅桌面端**——该行仅在 `window.desktopBridge.updates` 存在时渲染；web 组合隐藏。
