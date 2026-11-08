# Agent Note: 分叉用量计费插件，把卡面移到设置菜单

Status: implemented

[English](2026-11-08-forked-usage-billing-settings-card.md) | 中文

部分取代 [内置用量与计费仪表盘，由 git 子模块接入](2026-11-08-built-in-usage-billing-plugin.zh.md)：行、组合与模块表不变，只读归属关系变了。

## 问题

内置的用量/费用仪表盘此前以只读第三方子模块接入：一行 bundle patch、不改源码，上游发版只挪 gitlink（[前一篇](2026-11-08-built-in-usage-billing-plugin.zh.md)）。这样拿到的是界面，不是产品。

两条产品决定无法从插件外部表达：

- **侧栏默认不该有这张卡。** 侧栏底部是本 fork 自己的导航列，常驻的花费卡与它争位置；为了让用户能收起它，fork 已经不得不造一个「完全隐藏」模式加恢复入口。
- **卡面应该放在设置菜单的用户名下方。** 打开齿轮正是用户问「我花了多少」的时刻，答案该是菜单说的第一件事，就在用户名下面；点它打开完整仪表盘。

插件默认是可见的（`mode: 'full'`）且只画在侧栏；改成隐藏后，设置分区又成了唯一的入口，比用户预期多深一层。两个修复都在插件的 client 半区里，必须改插件——而只读子模块契约正是禁止这件事的地方。

## 决策

### 仓库改为 fork 自有

`plugins/dsh-ui-usage-billing` 现在指向 `sdkwork-ai/sdkwork-dsh-usage-billing`，自 `kenz1117/dsh-ui-usage-billing` 的 `v1.8.3-alpha.4` 分叉。该 fork 是插件源码、随仓提交的 `lib/` 构建产物与产品默认值的权威；本仓库仍以 gitlink 钉住它。[AGENTS.md](../../../../AGENTS.md#third-party-plugin-submodules-are-read-only-merge-stable-contract) 与 `plugins/README.md` 现在写明例外：只有 `url` 指向 SDKWork 自有仓库的子模块可以就地编辑，当前只有这一条符合。

npm 包名（`@kenz1117/dsh-ui-usage-billing`）与 loader 行 id（`ui-usage-billing`）保持不变。改任一个都会牵动 bundle 组合、插件自己的构建与所有引用，却换不来用户可见的收益；fork 的身份落在仓库、README 声明与 changelog 里。

### 默认：侧栏卡隐藏

`DEFAULT_BILLING_CARD_PREFS.mode` 由 `'full'` 改为 `'hidden'`。读取改为 fail-closed：只有存储里的 `mode` 明确是 `full` / `compact` 才显示卡片，fork 之前写下的偏好对象（没有 `mode` 字段或非法值）解析为隐藏，而不是按历史默认把侧栏卡放回来。插件自己的设置页仍提供完整卡片 / 紧凑图标 / 完全隐藏，并保留完全隐藏的恢复入口守卫（`resolveBillingCardMode`）。「完全隐藏」的提示文案改为指向设置菜单，不再只指向宿主原生设置页。

### 默认：输入框底栏两枚胶囊不显示

输入框底栏原本默认挂着两枚计费胶囊：左边「低谷队列」（入口与入队控件），右边「价格」（即时代价胶囊）。全新安装现在两个都关（`DEFAULT_QUICK_QUEUE_PREFS.showEntry`、`DEFAULT_LIVE_COST_BAR_PREFS.show`），理由与侧栏卡相同：书写界面不该默认带着计费装饰。

开关的位置也挪了。以前它们塞在设置页的「功能开关」三列网格里，与模型工具、中转站列表并列，让一个输入框偏好看起来像分析偏好。设置中心现在第一组、导航第一项就是「输入框底部内容」，两个开关放在同一张卡里：低谷队列与价格，各带一行说明。价格开关打开时才展开位置选择（输入框内部 / 上方 / 下方），关着的开关下面不会留一个无意义的选项。

只改默认值对这两个字段不够，所以修复不只是常量。旧版本把「显示」当默认值，而任何一次写偏好——点一下队列开关、改一次悬浮窗位置——都会把当时的 `show: true` / `showEntry: true` 存进 `localStorage`。带着这类记录升级的用户会继续看到这次改动要收起的胶囊（正是报告的症状）。现在读取是 opt-in：只有显式 `true` 才显示；客户端另跑一次性迁移（`dsh.ui-usage-billing.composer-footer-hidden`），每个浏览器只把两个显示字段关一次，同时保留位置、排队开关、清稿与来源会话复用等字段。用户之后手动打开的开关会被保存并生效，迁移标记保证它不会跑第二次。

### 设置菜单里的卡面是席位，不是菜单功能

设置菜单是本 fork 自己的外壳（`ui-sdkwork-settings-menu`），它不该知道计费语义。卡面通过槽位进入：

- **契约归属**：`packages/client/ui-settings` 声明 `settings.menu.account`，owner 份额只有 `{ close }`——这是这里的內容唯一需要的宿主能力，因为卡面会打开更宽的表面，菜单不能继续压在上面。
- **外壳**：`ui-sdkwork-settings-menu` 在 children 表里声明该席位，并把渲染成一个非交互块，位置在账户身份行正下方、菜单自身命令之前。点行会关菜单；卡面通过 `close` 请求同样的行为。
- **原语**：`SubmenuMenu` 新增 `block` 条目（`{ type: 'block', id, node }`），以 `display: contents` 加入列表的列向 flex，而不会变成 `menuitem`。这是让 owner 把内容放到行之间、又不为一个非命令内容发明命令、也不重写菜单的最小扩展。
- **插件**：`SettingsUsageCard` 用 `ctx.slots.inject` 注册进 `settings.menu.account`，因此没声明该席位的宿主只是不显示卡面。它的槽位类型在插件仓本地声明（module augmentation），因为该仓对着已发布的 `0.2.2-rc.1` 包构建；两处声明描述的是同一个 single/root 席位。

### 两张卡显示同一组数字

设置卡不取数。`ctx.billingMetrics`（原本就是插件给主题消费方的只读服务）现在额外发布侧栏卡的完整卡面 `BillingCardSnapshot`：今日/本周/本月费用与 token、近 7 天迷你柱、当日环比、显示币种、卡面偏好、取数失败原因。侧栏实例在相关数值变化时发布；设置卡读取/订阅它，画同一枚仪表、同一个标签、同一个数字、同一个涨跌徽章与迷你柱。

这正是要新建席位而不是第二处取数的原因：在第二个地方重算今日费用，迟早会为同一笔钱给出不同的数（用户自定义价重估、币种、统计范围与失败态都长在侧栏实例的计算里）。可见的代价是：隐藏卡面**不会**停止侧栏实例轮询——它正是设置卡打开齿轮时能立刻出数的原因。

## 备选方案

**保持子模块只读，在宿主包里画一张卡。** 设置菜单用 `ctx.billingMetrics` 自己画卡，插件只保留侧栏卡。否决：两套卡面实现会漂移，计费文案与布局会落到宿主包，fork 的设置外壳也会依赖另一个功能的语义。

**给卡面模式加一个宿主 config 默认值。** 否决：卡面模式是 client 的 localStorage 偏好，插件的 host 半区从不读它；加 config 需要新的客户端读取链路，而且仍然覆盖不到设置菜单里的卡。

**强制隐藏、不给用户控制。** 否决：这会拿走插件自己的恢复契约（完整 / 紧凑 / 隐藏），让「把侧栏卡叫回来」必须改代码；这是产品默认值，不是锁。

**两处都显示。** 否决：保留了这次改动要消除的侧栏杂乱，还把同一个数字在屏幕上写两遍。

**把整个仪表盘搬进设置。** 否决：仪表盘是宽体多 Tab 弹窗，设置菜单只放一张卡作为入口；卡是入口，仪表盘仍是表面。

## 后果

- 全新安装的侧栏没有用量卡；打开齿轮，用户名下方就是今日花费，点击卡面打开仪表盘。已存的偏好仍然优先，设置页随时可以恢复侧栏入口。
- 两张卡在构造上不可能互相矛盾：一次计算、一份发布的快照。指标服务新增 `readCard`/`subscribeCard`/`publishCard`；`BillingCosts` 的消费方不受影响。
- 设置菜单的行模型在 fork 自有的 `SubmenuMenu` 里多了 block 条目；将来任何 owner 都能在行之间放内容而不必新增命令。
- 上游插件发版从此是 fork 合并，而不是挪 pin：`plugins/README.md` 记录了「先构建再提交」的工作流，pin 指向 fork 自己的发布提交（`1.8.4-sdkwork.3`）。
- 体积代价：`lib/client.js` 372,327 字节（363.3 KiB），比上游 `1.8.3-alpha.4` 产物大约多 9.0 KiB，仍远低于插件自设的 500 KiB 强警告线。

## 验证

- `packages/client/ui-primitives/tests/submenu-menu.client.spec.tsx` 在标题与行之间渲染一个 block，并断言它不是 `menuitem`、不能被选中。
- `packages/client/ui-sdkwork-settings-menu/tests/settings-menu-root.client.spec.tsx` 断言账号卡的 DOM 位置在身份行下方、第一条命令之前，不是菜单行，并且它的 `close` 会关掉菜单。
- 插件的 `tests/settings-menu-card.component.spec.tsx` 覆盖投影（币种、统计范围、Token 视角、环比、失败标题）与点击契约（先 `openDashboard` 再 `close`）；`tests/billing-card-settings.spec.ts` 钉住新的默认值。
- 插件的 `tests/usage-billing.client.spec.tsx` 断言输入框底栏卡片里两个开关都在且默认都关，位置选择只在价格开关打开后出现；`tests/live-cost.client.spec.tsx` 与 `tests/task-queue-quick.client.spec.tsx` 钉住两个偏好的默认值与存量偏好兼容口径；`tests/composer-defaults-migration.spec.ts` 覆盖一次性迁移（旧存储里的 `true` 被关一次、之后手动打开仍然生效、其它字段不受影响）。
- `packages/bundle/web-app/tests/built-in-usage-billing.spec.ts` 在随仓 client bundle 不再注册 `sidebar.footer.action`、`settings.section` 或 `settings.menu.account` 时失败。
