# Agent Note: SDKWork 自动化任务表面

Status: implemented

[English](2026-09-30-sdkwork-automation-task-surface.md) | 中文

## 问题

`packages/client/ui-sdkwork-automation` 渲染本 fork 的 `automation` 模式页面，而它背后的 Host Schedule 能力是按需开启的：随发行版交付的 Web 组合不挂载 `schedule` 行，因此默认安装既不提供任务读取也不提供 `schedule_*` 工具，而该页面是本 fork 呈现 Host 已存任务的产品界面（见[定时任务按需开启决策](2026-09-24-schedule-opt-in-optional-bundle.zh.md)）。upstream 的 Schedule UI 为同一批记录提供了任务页面，但它随可选 bundle 的 `ui-schedule` 行交付，且 Host 只把任务创建暴露为面向模型的 `schedule_create` 工具，因此不存在可供浏览器页面调用的 Remote 写入。

## 决策

自动化页面是本 fork 自己的定时任务表面。`packages/client/ui-sdkwork-automation` 经客户端 Remote 装配读取 Host Schedule 能力：`src/client/index.ts` 注入 `remote.schedule`，把 `schedule/catalog`、`schedule/delete` 与 `schedule/history` 交给本包自己的目录源（`src/client/catalog-source.ts`），由它持有记录、查询状态、删除与重试。该页面不是 upstream `ui-schedule` 页面的挂载：页面（`src/client/AutomationPage.tsx`）、文案（`src/client/locales.ts`，命名空间 `automation`）与数据层都由本 fork 拥有，而模式 id、侧边栏入口与 frame 的侧边栏可见集合保持[侧边栏动作席位决策](2026-09-07-sdkwork-sidebar-actions-and-mode-pages.zh.md)所记录的状态。

`src/client/schedule-format.ts` 与 `src/client/task-cron.ts` 是 `packages/client/ui-schedule/src/client/` 下同名 upstream 文件的逐字节一致移植，因此同一条已存规则在两个界面上读法一致。这份重复是刻意的，每次 upstream 合并都会重新核对这两对文件。

任务创建背后没有 Remote 方法：Host 的 Schedule 服务把 `list`、`catalog`、`history`、`delete` 与 `update` 导出为 Remote 方法，创建则没有对应的方法。因此添加任务弹窗合成一条点名确切 `schedule_create` 参数的请求（`src/client/create-request.ts`），由插件把它派发进一次新会话（`src/client/index.ts`）：运行共享的新会话流程，在有限时间内等待落地的 Session，再排入一条 user 消息。这正是本 fork 有该弹窗、而 upstream 页面只有启动会话的 New 动作的原因。

报告 `gateway/invocation-unavailable` 的读取会成为目录源自己的 `'unavailable'` 状态（`src/client/catalog-source.ts`），而不是普通查询失败：页面说明随发行版交付的组合没有挂载定时任务能力，并指出插件管理页是开关所在，该状态的重试会在可选 bundle 启用后重新读取目录。

## 考虑过的替代方案

**整页移植 upstream 的 `ui-schedule` 页面。** 本 fork 的模式页面会随之带上其 `schedule.manager` 文案与布局，此后 upstream 对该页面的每次改动都需要人工再合并；本 fork 改为对行为不允许漂移的部分沿用 upstream 自己的组件——规则格式化器、日期与时钟选择器、操作菜单、投递记录——而页面、列表与创建弹窗则由本包自己拥有。

**为创建新增一个 Remote 方法。** 创建是面向模型的 `schedule_create` 工具背后的服务方法，模型读到的参数词表由该工具拥有；新增 Remote `create` 会加一条只有该弹窗调用的浏览器写入路径，并与已经在执行同一操作的工具保持同步。

**把缺失的能力当成普通查询失败。** 随发行版交付的组合不挂载 `schedule` 行，那里的读取都会报告 `gateway/invocation-unavailable`；失败状态会把一个只是关掉了能力的安装说成查询出错，并掩盖让读取成功的那个开关。

**保留静态模板与没有能力的页面。** 可选 bundle 让创建成为真实能力后，添加入口会仍然是惰性的（`aria-disabled`），而本 fork 的组合不会为 Host 的已存任务提供任何页面，因为 upstream 的任务页面位于该组合省略的那一行里。

## 后果

- 页面在状态筛选与搜索框之后列出 Host 保留的全部任务（活跃与不活跃），给出每个任务的已存名称、频率与下次执行时间；删除在发起该操作的行内确认，并且只在一次权威重读确认移除后才清除该行；运行记录视图合并最新二十个任务的已保存投递记录，十二张模板卡片目录保留在列表下方。模板卡片会把自身的名称、任务内容与重复规则填进同一个添加任务弹窗；该弹窗按打开时刻解析重复规则的首次执行，在选择器指定的工作空间中开始会话，并支持任何不短于一分钟的间隔。
- 添加任务弹窗的确认把合成请求送进一次新会话，因此任务在模型调用 `schedule_create` 后才存在；被拒绝或丢失的 prompt 只把请求留在那次会话里。
- 任务详情同样属于本包：选中一行会打开 `src/client/TaskDetail.tsx`，在那里把已存名称、任务内容与运行时间作为一次比较并更新请求提交，确认删除，列出该任务已保存的投递记录，并在当前元数据仍判定可用时打开它的原会话。
- `src/client/schedule-format.ts`、`src/client/task-cron.ts`、`src/client/task-timing.ts`、`src/client/DatePicker.tsx`、`src/client/ClockPicker.tsx`、`src/client/TaskMenu.tsx` 与 `src/client/DeliveryHistory.tsx` 必须在每次合并时对照 upstream 重新核对，其中任一文件的改动都要人工移植到两个界面。`task-cron.ts` 与 `task-timing.ts` 通过一个小的带类型读取器读取匹配模式的可选捕获组，因为客户端编译面把每个捕获组都当作存在，而未参与匹配的组在运行时是 `undefined`。
- 随发行版交付的 Web 组合不挂载 `schedule` 行，因此默认安装看到的是 `'unavailable'` 状态；在插件管理页启用可选 bundle 会让同一页面变成任务列表。
- 覆盖锚点：`tests/catalog-source.client.spec.ts`、`tests/automation-page.client.spec.tsx`、`tests/automation-runs.client.spec.tsx`、`tests/task-detail.client.spec.tsx`、`tests/delivery-history.client.spec.tsx`、`tests/task-menu.client.spec.tsx`、`tests/date-picker.client.spec.tsx`、`tests/clock-picker.client.spec.tsx`、`tests/create-request.client.spec.ts`、`tests/apply.client.spec.ts` 以及格式化器与时间规格。
