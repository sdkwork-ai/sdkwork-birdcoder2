# 新增「设置菜单」插件（配置覆盖方式，不改原插件源码）

## 架构决策（按你的要求：不动 ui-settings-general 源码，用配置覆盖）

`ui-settings-general` 是 upstream 插件，其 `mode.rail.settings` 席位 occupant（trigger+弹窗）和 `settings.*` 槽位声明都在它内部。按"对原有插件进行配置覆盖"的方式：

1. **`packages/bundle/web-app/cordis.patch.yml` 中把原行 `ui-settings-general` 置为 `disabled: true`**（patch 行按 id 覆盖整行 config——这就是配置覆盖；原插件源码一行不动，upstream 更新互不影响）。
2. **插入新行 `ui-settings-menu` → `@deepseek-ai/dsh-client-ui-settings-menu`**（新插件完整接管设置界面：trigger + hover 菜单 + 设置弹窗 + 设置槽位声明）。desktop-app bundle 继承 web roster，自动生效。
3. `ui-settings` 契约包的 `settings.*` SlotMap 类型不变，所有现有注册者（ui-theme 外观行、ui-settings-models、插件清单、onboarding 步骤等）通过 `slots.inject` 挂到我们声明的同名槽位上，无需改动。

## 新插件包 `packages/client/ui-settings-menu`

按 packages/client/AGENTS.md 新包清单建骨架（package.json 含 `dsh.client` manifest、tsconfig、tsdown、src/index.ts、invariant.ts、css-modules.d.ts、README）。

**apply(ctx) 注册内容**：
- 提供 `ctx.account` 服务（`declare module '@deepseek-ai/cordis'` 类型合并，仿 `ctx.theme` 的 `ctx.provide` 模式）：快照 `{ signedIn, username?, membership?, points? }` + `logout()`；默认实现=未登录态（用户名显示「未登录」、会员/积分隐藏、退出登录禁用）。这是后端接入的 seam，后续只替换服务实现。
- 注册 locale 命名空间 `settings.menu`（zh/en：trigger/标题/关闭/通用设置 + 菜单文案 外观/深色/浅色/跟随系统/帮助和反馈/检查更新/退出登录/会员等级/积分余额/未登录/即将上线占位）。
- 注册 `mode.rail.settings` 席位 occupant（SettingsMenuRoot，priority 0 即唯一 occupant）：trigger 按钮（复用 `settings.trigger` 槽渲染 icon+隐藏 label）+ **hover 弹出菜单** + 重实现的设置弹窗 + onboarding 协调器；children 声明 `settings.trigger/header/action/close/section/onboarding/general.item`（与原插件同名的完整槽位集）。
- 注册 chrome 内容（trigger/header/close）、loopback 的「打开配置文件」action（settings.openDocument RPC）、通用设置 section（渲染 `settings.general.item` 行）——均为原插件对应组件的等价重实现（原文件都很小：GeneralSection 20 行、chrome 30 行、document action 50 行）。
- 主题镜像：`ctx.on('theme/change')` → 小 store（preference），外观子菜单选中态；注入 `setTheme(id)` 回调（调 `ctx.theme.setTheme`）。
- 更新 seam：注入检查 `window.desktopBridge.updates` 是否存在；「检查更新」仅桌面端显示，调 `updates.check()`；web 端隐藏该项（仿 ui-updater 的守卫模式）。

**菜单结构**（用 ui-primitives `Menu`：portal、side right、closeOnPointerLeave）：
- header（新增 `header` prop，镜像 footer）：用户名 + 用户 icon
- 分组一：会员等级（新 icon 皇冠）、积分余额（新 icon 硬币）——有数据才显示，默认隐藏
- 分隔线 + 分组二：设置（齿轮 icon → 打开设置弹窗）、外观（子菜单：深色/浅色/跟随系统，各带 icon + 当前项勾选）、帮助和反馈（问号 icon → Toast 占位「即将上线」）、检查更新（刷新 icon）
- footer：退出登录（新 icon 登出，danger 样式，未登录时禁用）

**交互**：hover 打开（pointerenter）+ 点击切换 + focus 打开，pointer-leave 优雅关闭（Menu 的 closeOnPointerLeave + 指针宽限），Escape/外部点击关闭。

## ui-primitives 小幅扩展（共享原语，带测试）

- `Menu.tsx`：新增 `header?: ReactNode`（viewport 上方固定，与 footer 对称）；子菜单项支持 `selectedId`/`selectedIds` 勾选标记（外观选中态需要）。
- 新增 3 个自绘 icon：`IconLogoutOutline14`、`IconCrownOutline16`、`IconCoinOutline16`（风格与现有 outline 集一致）。

## 登记三处 + 构建

- `tsconfig.client.json` references 加新包；`web-app/cordis.patch.yml` 加行（含禁用原行）；`web-app/package.json` 加依赖。桌面端无额外改动。

## 测试与快照

- 新包单元测试（jsdom 组件测试：菜单分组渲染/hover 打开/外观子菜单切换主题/登出禁用/帮助占位 toast；apply 测试：槽位注册 + account 服务提供；100% 覆盖率门）。
- ui-primitives：Menu header/子菜单勾选测试、新 icon 测试。
- e2e：6 个现有 e2e（settings-chrome、models-settings、plugin-config、agent-preset-authoring、onboarding×2）的「点设置直接开弹窗」流程改为「点设置 → 点菜单项 设置 → 弹窗」（加 `openSettingsDialog` 辅助函数到 tests/support.ts）；settings-chrome 快照按新交互刷新；新增设置菜单 e2e（hover 弹菜单、分组、外观子菜单真实切主题、登出禁用）及新 golden；更新 fixture inventory 清单。

## 收尾

- 按仓库规范补 Agent Note（配置覆盖模式 + account seam 说明）；`pnpm run test:gui`、`DSH_SNAPSHOT=replay pnpm run test:web`、typecheck、lint、coverage、build 等门禁。