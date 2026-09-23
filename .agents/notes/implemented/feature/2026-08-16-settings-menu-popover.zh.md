# Agent Note：设置菜单浮层取代设置弹窗的直接触发器

Status: implemented

[English](2026-08-16-settings-menu-popover.md) | 中文

## 问题

模式栏的设置齿轮（`mode.rail.settings` 席位，见[设置移入模式栏底部席位](2026-08-16-settings-rail-seat.zh.md)）原来点击直接打开设置弹窗。产品要求在齿轮上改为 hover 弹出菜单：顶部账户头（用户名）、会员/积分分组、功能分组（设置 → 现有弹窗、外观 → 浅色/深色/跟随系统、帮助和反馈、检查更新），以及底部固定的退出登录行——每行都带对应图标。fork 不得修改上游插件源码，这样上游同步更新不会与本表面冲突。

## 决策

新增插件包 `ui-sdkwork-settings-menu`（`@deepseek-ai/dsh-client-ui-sdkwork-settings-menu`）接管设置表面，组合层面在配置上覆盖上游外壳（所用杠杆见下方 [2026-09-23 更新](#update-2026-09-23-upstream-made-the-settings-namespace-the-row-id)）：

- **配置覆盖，而非改源码。** web bundle patch（`packages/bundle/web-app/cordis.patch.yml`）把 `ui-settings-general` 行置为 `disabled: true`，并插入 `ui-sdkwork-settings-menu`。*（2026-09-23 修订：该行改为保留上游 id 并指向本包——见[更新](#update-2026-09-23-upstream-made-the-settings-namespace-the-row-id)。）* 上游包源码一行不动；上游更新时只涉及该 patch 行（按 id 定位）与新包。桌面组合继承 web roster，无需额外行即可获得该菜单。
- **新插件声明全部设置席位。** `ui-sdkwork-settings-menu` 占据 `mode.rail.settings`，并重新声明 `settings.trigger/header/action/close/section/onboarding/general.item`，名称与规格与被替换的外壳一致。各功能注册者（ui-theme 外观行、ui-settings-models、插件清单、onboarding 步骤、loopback 的打开配置文件动作）通过 `slots.inject` 挂到新声明上，无需改动。设置槽位类型仍在 ui-settings。
- **hover 菜单。** 席位组件渲染触发器（`settings.trigger` 槽位内容），外包共享 `Menu` 原语——`side: right`、portaled、`closeOnPointerLeave`——hover、focus、点击打开；指针离开宽限期、Escape、外部点击、选中行后关闭。`Menu` 原语新增 `header` 槽位（footer 的镜像）用于固定账户行，子菜单行支持选中标记（外观勾选）。ui-primitives 新增三个图标：`IconLogoutOutline14`、`IconCrownOutline16`、`IconCoinOutline16`。
- **账户 seam。** 插件提供 `ctx.account`（`AccountRuntime`）：快照源（`{ signedIn, username?, membership?, points? }`）加 `logout()`。随附实现是匿名态——头部显示「未登录」，会员/积分行隐藏，退出登录禁用。未来账户后端在同一接口后替换实现，菜单永不改动。
- **行行为。**「设置」打开弹窗（同一组件拥有菜单与面板，弹窗打开状态仍是组件本地状态）。「外观」是 `ctx.theme.setTheme` 上的子菜单，选中态经 `theme/change` 通过注册者私有 observable 镜像。「帮助和反馈」显示占位 toast（尚无帮助中心或反馈渠道）。「检查更新」调用 `window.desktopBridge.updates.check()`，仅在 preload 表面存在时渲染（web 组合隐藏）。「退出登录」是 danger footer 行，未登录时禁用。
- **设置弹窗外壳是重实现，而非导入。** 面板、分区导航投影、onboarding 协调器、chrome 内容、通用设置分区、loopback 打开文档动作都是新包自己的等价实现（跨包值导入被禁止；原文件都很小）。

## 备选方案

| 否决 | 一句话理由 |
|---|---|
| 直接改 ui-settings-general 源码 | 违反同步独立性要求；上游更新会冲突 |
| 动态槽位 shadow 席位（更低 priority 注册） | 被 shadow 的 occupant 的弹窗和子槽位声明随之消失，且行为依赖上游插件内部实现——与独立性相反 |
| 经槽位系统复用原包的弹窗 | children 声明规则禁止渲染别的 entry 声明的槽位；只有同名重新声明才能让注册者继续工作 |

## 后果

设置表面完全归 fork 包所有：只要该行保持指向本包，上游对 ui-settings-general 的改动就无关紧要，唯一共享契约是 ui-settings 的槽位类型。代价：弹窗外壳（约 250 行）、chrome 内容、通用设置分区、打开文档动作按上游包的设计重复实现；web/desktop 两个 bundle 通过 web-app patch 的单一新行继承新 roster。

## 测试

包的 apply spec 钉住席位填充、账户服务、主题镜像与 teardown；组件 spec 驱动菜单行、外观子菜单选中、弹窗关闭路径与 onboarding 协调器。e2e 层：settings-chrome 流程经菜单打开弹窗（共享 `openSettingsDialog` 辅助函数），其 golden 集新增菜单快照；新增 settings-menu e2e 覆盖 hover 开关、子菜单真实主题级联、帮助 toast 与 web 隐藏的更新行。

## 更新（2026-09-23）：上游把设置命名空间改成了行 id

上游的 [profile 拥有实时配置](../architecture/2026-09-19-profile-owned-live-configuration.zh.md) 改动（PR #4587，2026-09-21）把「profile 承载的设置命名空间」从显式注册的名字改成了 **Cordis loader entry 自己的 `id`**：只有当某个该 id 的生效行用 `.volatile()` 声明了字段时命名空间才存在，Host 用 `configEditor.entries().find(row => row.options.id === ns)` 解析 `settings.mutate(ns, …)`，其余命名空间一律以 `No configurable plugin entry "<ns>"` 拒绝。

上面的策略在这套契约下不成立。把 `ui-settings-general` 行禁用、让本包挂在自己的 `ui-sdkwork-settings-menu` id 上，会让本包重新声明的每个命名空间都没有同 id 的生效行，而第一个受害者是内测声明：它唯一的退出路径就是**成功**把 `welcomeNoticeVersion` 写进 `ui-settings-general`（Escape 与点击遮罩按设计就是空操作），于是被拒绝的写入把用户永远卡在弹窗里，只剩「暂时无法保存确认状态，请重试。」。

因此该行改为保留上游 id、把实现包指向本包——这正是上游自己的 `directory-picker` 行已经采用的形状：

```yaml
- id: ui-settings-general
  name: '@deepseek-ai/dsh-client-ui-sdkwork-settings-menu'
```

后续 patch 行会整体替换同 id 的先前行，所以上游插件依然不会被装载：上面「配置覆盖，而非改源码」的理由一点没丢，换的只是杠杆。两个组合都由 web-app patch 的同一行覆盖，桌面 bundle 原样继承 web roster，因此合并时改动仍然是「一行」。

`packages/bundle/sdkwork-desktop-app/tests/composition-parity.spec.ts` 现在守住这一对：它从 `ui-settings-models` 的 `onboarding-copy.ts` 读出读取方的命名空间常量，断言在 web 与桌面两个组合里都存在恰好该 id 的行、该行未被禁用、且指向本包——同时 fork 专有的 `ui-sdkwork-settings-menu` 行 id 保持缺席。
