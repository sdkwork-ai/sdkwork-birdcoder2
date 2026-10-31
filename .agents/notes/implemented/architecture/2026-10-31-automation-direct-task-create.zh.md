# Agent Note: 自动化任务经 Schedule Remote 创建

Status: implemented

[English](2026-10-31-automation-direct-task-create.md) | 中文

## 问题

自动化页面的添加任务弹窗——新建动作与每张模板卡片——原先通过把一条合成好的 `schedule_create` 请求派发进新会话的方式创建任务。写入该页面时这是唯一路径：Host 只把创建暴露为面向模型的工具。如今 Host 已把基于 target 的 Schedule 能力发布为 Remote 方法，其中包含 `schedule/create`，而经模型中介的路径在随发行版交付的桌面构建中失败：派发流程等待新 Session 出现在 Session 列表里，再解析它的 face，但 id 会先进入列表、客户端尚未建立它的 scope，于是插件记录 `[automation] prompt dispatch skipped: session … has no face`，被确认的草稿就此消失——既没有消息，也没有任务。即便它能落地，任务是否存在、名称、内容与时间也都取决于模型转抄这条请求，而且任务会汇报进弹窗恰好打开的那条会话。

## 决策

弹窗的确认就是一次 `schedule/create` Remote 写入。`src/client/create-request.ts` 把草稿映射成 `ScheduleCreateRequest`：修剪后的名称、追加了文风、有效期与推送行的任务内容、时间规则，以及一个 `new_once` 目标，其 `cwd` 为所选工作空间的目录（未选择时用 Host 默认值）。时间使用 Host 自己的类型——单次用 `at`，每天用 `daily`，每周用 `weekly`，固定间隔用 `every`，每月用按月的 `cron`——因此目录用设计文案陈述规则（`每天 09:00`、`仅一次`），任务详情也能重新打开其中每一种进行编辑。

`src/client/index.ts` 通过 `ctx.remote.schedule.create` 写入，然后用目录最近一次观察到的请求序号重读目录，因此这次读取不会被并入写入之前发出的读取，并把已存任务返回。页面据此关闭弹窗并选中新行。写入被拒绝时，弹窗与草稿保留并陈述本地化的修正：`not_future`、`invalid_prompt` 与规则、时区错误码从 `schedule/input-invalid` 的 details 映射，传输层拒绝则归为未分类失败。`draftReady` 现在还要求任务内容非空，因为 Host 会拒绝空内容。

模板种子不再让弹窗搁浅：不指定时间的单次模板从当前时间起一小时后开始，体检卡片取下一个 07:00，因此没有卡片会打开一个确认按钮按不下去的弹窗。两条与自身规则矛盾的文案也已修正：面试卡片不再声称仅工作日（间隔规则无法表达），体检卡片不再指定已经过去的日期。

[自动化任务表面笔记](2026-09-30-sdkwork-automation-task-surface.zh.md)保留页面归属决策；其中关于创建的段落现在指向本笔记。

## 考虑过的替代方案

**等待 Session face 就绪，而不是直接写任务。** 反复重试直到 `scope()` 解析成功能让派发更可靠，但创建仍取决于一次可能拒绝、改写或失败的模型调用，模板的时间、名称与目标依旧没有保证，而且每次确认仍要消耗一条会话与一轮模型调用。回归测试也无法钉住所创建任务的精确已存形态。

**保留两条创建路径：模板卡片走模型，新建动作直接写入。** 同一个弹窗的同一份草稿会产出两种不同的任务——目标不同、时间类型不同——而本笔记修掉的失败模式会在其中一条路径上继续存在。

**为创建新增一个 Remote 方法。** 没有必要：Host 基于 target 的能力已经导出 `schedule/create`（`@Remote('create')`），并与 `catalog`、`edit`、`history` 与 `run` 并列；本 fork 的页面只是仍带着"不存在写入"的旧假设。

**每月选项只用原始规则文本表达。** Host 没有按月的时间类型，先前的组合把每月写成 RFC 5545 规则；那条规则在列表里既不是设计文案，在详情里也不可编辑。五字段 cron `M H D * *` 表达同一条"每月某日"，经 cron 格式化器读出，并且正是详情里月度构造器所拥有的形态。

## 后果

- 每次确认一次 Remote 写入：不启动会话、不消耗模型调用，模板确认在写入后的重读完成时立刻显示其任务行。
- 写入被拒绝时保留弹窗、草稿与修正说明；写入进行中弹窗禁用两个按钮。
- 创建出的任务始终汇报进 Host 在首次投递时创建并复用的会话，所以模板的后续内容读起来是同一条线索。任务行的目标与详情都会说明这一点；弹窗无法把任务指向作者当前所在的会话。
- 由各频率创建的任务行都读作设计中的频率文案，而不是原始规则，其详情可重新打开时间规则进行编辑——每月选项也一样，经由构造器能识别的按月 cron。
- marketplace 的创建流程仍会把合成提示词派发进新会话；本决策只覆盖自动化表面。
- 覆盖：`tests/apply.client.spec.ts`（写入、重读顺序与每种拒绝映射）、`tests/create-request.client.spec.ts`（每种频率的时间与目标）、`tests/automation-page.client.spec.tsx`（预填、原地拒绝、选中已存任务行）、`tests/AutomationCreateModal.client.spec.tsx`（进行中与失败状态）以及 `tests/template-seeds.client.spec.ts`（没有种子会让确认按钮不可用）。

## 验证

在桌面开发构建中，模板卡片填入种子后确认即存下任务，列表随即以设计中的频率文案显示它。一条把运行时间设在两分钟后的单次任务在该时刻投递进一条新建会话：其 Session 日志带有包含已存任务内容的 `[SCHEDULE REMINDER]` 消息、助手回复与 `turn/end`，而已存任务为 `status: "ended"` 并带有投递回执，页面在下一次读取时显示已结束。本包自身的套件（`pnpm exec vitest run packages/client/ui-sdkwork-automation`，531 个测试）与其 `tsc -b` 项目在没有真实 Host 的情况下覆盖请求形态、失败映射与弹窗状态。
