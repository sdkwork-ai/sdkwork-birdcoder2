# Agent Note: SDKWork 自动化任务表面

Status: implemented

[English](2026-09-30-sdkwork-automation-task-surface.md) | 中文

## 问题

`packages/client/ui-sdkwork-automation` 渲染本 fork 的 `automation` 模式页面，而它背后的 Host Schedule 能力是按需开启的：随发行版交付的 Web 组合不挂载 `schedule` 行，因此默认安装既不提供任务读取也不提供 `schedule_*` 工具，而该页面是本 fork 呈现 Host 已存任务的产品界面（见定时任务按需开启决策）。upstream 的 Schedule UI 为同一批记录提供了任务页面，但它随可选 bundle 的 `ui-schedule` 行交付；本页面则是在 Host 只把任务创建暴露为面向模型的 `schedule_create` 工具时写成的。

## 决策

自动化页面是本 fork 自己的定时任务表面。`packages/client/ui-sdkwork-automation` 经客户端 Remote 装配读取 Host Schedule 能力：`src/client/index.ts` 注入 `remote.schedule`，把 `schedule/catalog`、`schedule/delete` 与 `schedule/history` 交给本包自己的目录源（`src/client/catalog-source.ts`），由它持有记录、查询状态、删除与重试。该页面不是 upstream `ui-schedule` 页面的挂载：页面（`src/client/AutomationPage.tsx`）、文案（`src/client/locales.ts`，命名空间 `automation`）与数据层都由本 fork 拥有，而模式 id、侧边栏入口与 frame 的侧边栏可见集合保持[侧边栏动作席位决策](2026-09-07-sdkwork-sidebar-actions-and-mode-pages.zh.md)所记录的状态。

`src/client/schedule-format.ts` 与 `src/client/task-cron.ts` 是 `packages/client/ui-schedule/src/client/` 下同名 upstream 文件的逐字节一致移植，因此同一条已存规则在两个界面上读法一致。这份重复是刻意的，每次 upstream 合并都会重新核对这两对文件。

任务创建是一次 `schedule/create` Remote 写入：添加任务弹窗合成完整请求（`src/client/create-request.ts`），插件写入并重读目录（`src/client/index.ts`），模板卡片只是填进同一个弹窗，而不是第二条路径。[直接创建笔记](2026-10-31-automation-direct-task-create.zh.md)记录了此前经模型中介的通道为何被替换，以及具名时间类型与 `new_once` 目标如何让已存任务可编辑、并让投递留在同一条会话里。

每一行都带有其任务可执行的操作：立即执行（一次 `schedule/run`）、打开详情并把光标放进名称的编辑按钮、含运行记录/任务详情/删除的溢出菜单，以及按该行读取时的修订号提交 `active` 的启用开关。`src/client/row-actions.ts` 拥有这些控件共用的词表：Host 自身的哪一项限制（投递进行中、最小间隔、关联会话已归档）挡住了立即执行，以及一次执行或一次生命周期变更落成了什么结果。已经落定或被拒绝的操作在列表上方陈述一行；已结束任务的开关保持禁用，因为 Host 需要新的运行时间才能恢复它。

报告 `gateway/invocation-unavailable` 的读取会成为目录源自己的 `'unavailable'` 状态（`src/client/catalog-source.ts`），而不是普通查询失败：页面说明随发行版交付的组合没有挂载定时任务能力，并指出插件管理页是开关所在，该状态的重试会在可选 bundle 启用后重新读取目录。

本页替换上游任务页，而不是与其并存。可选 bundle 的 `ui-schedule` 行带有一条 `disabled` 表达式，只在本页的 Loader 行（`ui-sdkwork-automation`）运行期间隐藏它：两个页面回答同一个问题，而这些 seat 一次只允许一个任务表面；关掉本行，上游页面会在同一份组合里恢复。`packages/experimental/schedule-bundle/tests/patch.spec.ts` 会在两种状态下求值该表达式。

## 考虑过的替代方案

**整页移植 upstream 的 `ui-schedule` 页面。** 本 fork 的模式页面会随之带上其 `schedule.manager` 文案与布局，此后 upstream 对该页面的每次改动都需要人工再合并；本 fork 改为对行为不允许漂移的部分沿用 upstream 自己的组件——规则格式化器、日期与时钟选择器、操作菜单、投递记录——而页面、列表与创建弹窗则由本包自己拥有。

**把创建留在面向模型的工具背后。** 写入该页面时，创建只能经 `schedule_create` 触达，这也是弹窗把请求派发进新会话的原因。该通道把任务是否存在及其形态交给一轮模型调用，并在随发行版交付的构建中尚未抵达模型就失败；Host 后来提供的 Remote `create` 让弹窗成为完整的创建路径（见[直接创建笔记](2026-10-31-automation-direct-task-create.zh.md)）。

**把缺失的能力当成普通查询失败。** 随发行版交付的组合不挂载 `schedule` 行，那里的读取都会报告 `gateway/invocation-unavailable`；失败状态会把一个只是关掉了能力的安装说成查询出错，并掩盖让读取成功的那个开关。

**保留静态模板与没有能力的页面。** 可选 bundle 让创建成为真实能力后，添加入口会仍然是惰性的（`aria-disabled`），而本 fork 的组合不会为 Host 的已存任务提供任何页面，因为 upstream 的任务页面位于该组合省略的那一行里。

## 后果

- 页面在状态筛选与搜索框之后列出 Host 保留的全部任务（活跃与不活跃），给出每个任务的已存名称、频率与下次执行时间；删除在发起该操作的行内确认，并且只在一次权威重读确认移除后才清除该行；运行记录视图合并最新二十个任务的已保存投递记录，十二张模板卡片目录保留在列表下方。模板卡片会把自身的名称、任务内容与重复规则填进同一个添加任务弹窗；该弹窗按打开时刻解析种子的首次执行——不指定时间的单次从当前时间起一小时后开始——指定任务首次创建会话所在的目录，并支持任何不短于一分钟的间隔。
- 添加任务弹窗的确认针对 `new_once` 目标写入一次 `schedule/create` 请求，因此 Host 一接受任务就存在；被拒绝时草稿保留并陈述 Host 的修正。每一种频率创建出的任务其频率都读作设计文案，其详情也能重新打开同一时间规则进行编辑。
- 每一行的立即执行、编辑、菜单与开关无需先打开详情；立即执行陈述挡住它的 Host 限制，开关的暂停或恢复是一次携带修订号的编辑，其结果由列表说明。删除移入该行的菜单，并保留原地确认。
- 任务详情同样属于本包：选中一行会打开 `src/client/TaskDetail.tsx`，在那里把已存名称、任务内容与运行时间作为一次比较并更新请求提交，确认删除，列出该任务已保存的投递记录，并在当前元数据仍判定可用时打开它的原会话。本编辑器无法表达的 Host 写入 RFC 5545 规则保持只读——详情会说明这一点——而其名称与任务内容仍作为仅内容补丁保存。
- `src/client/schedule-format.ts`、`src/client/task-cron.ts`、`src/client/task-timing.ts`、`src/client/DatePicker.tsx`、`src/client/ClockPicker.tsx`、`src/client/TaskMenu.tsx` 与 `src/client/DeliveryHistory.tsx` 必须在每次合并时对照 upstream 重新核对，其中任一文件的改动都要人工移植到两个界面。`task-cron.ts` 与 `task-timing.ts` 通过一个小的带类型读取器读取匹配模式的可选捕获组，因为客户端编译面把每个捕获组都当作存在，而未参与匹配的组在运行时是 `undefined`。
- 随发行版交付的 Web 组合不挂载 `schedule` 行，因此默认安装看到的是 `'unavailable'` 状态；在插件管理页启用可选 bundle 会让同一页面变成任务列表。
- 覆盖锚点：`tests/catalog-source.client.spec.ts`、`tests/automation-page.client.spec.tsx`、`tests/automation-runs.client.spec.tsx`、`tests/task-detail.client.spec.tsx`、`tests/delivery-history.client.spec.tsx`、`tests/task-menu.client.spec.tsx`、`tests/date-picker.client.spec.tsx`、`tests/clock-picker.client.spec.tsx`、`tests/create-request.client.spec.ts`、`tests/apply.client.spec.ts` 以及格式化器与时间规格。
