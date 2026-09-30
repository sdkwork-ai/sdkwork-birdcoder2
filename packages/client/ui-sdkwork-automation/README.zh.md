---
description: "SDKWork Automation 独立模块:侧边栏新建会话按钮区域的自动化快捷入口,以及带定时任务与运行记录两个视图的中栏页面。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-automation

[English](README.md) | 中文

## 概述

自动化作为独立模块:位于侧边栏新建会话按钮区域的快捷入口,以及以 `automation` 模式 id 键入的页面。页面把 Host Schedule 中全部保留任务列在状态筛选与搜索框之后;每行给出名称、频率与下次执行时间,并可展开详情面板——在面板里修改名称、任务内容与运行时间,确认删除,并在原会话入口旁查看已保存的投递记录。列表下方的模板目录把某张卡片的重复规则填进同一个添加任务弹窗;该弹窗选择会话所在的工作空间,并提交合成好的 `schedule_create` 请求。

## 目录

- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

## 运行时不变量

未发布 runtime invariant 伴生物;入口是席位 owner share 的纯函数,键控页面渲染本包读取的 Host 目录,由本包客户端行为规格直接覆盖。

## 模型体验

无,因为本浏览器界面自身不注册提示词、工具 schema 或会话事件;创建弹窗的确认只发送一条普通用户消息,与人工在输入框里敲入的内容相同。

#### KV Cache 影响

无;本包既不组装也不发送 provider 请求。

## 已知限制与后续工作

- **创建经由一次会话完成** — Host 没有创建任务的 Remote 方法,因此弹窗确认会把合成请求送进新会话,任务在模型调用 `schedule_create` 后才存在;被拒绝或丢失的 prompt 只把请求留在会话里,不会创建任何任务。
- **定时任务是可选项** — 随发行版交付的 Web 组合不含 `schedule` 行,未启用可选 bundle 时页面会说明该能力未启用,而不是列出任务。
- **运行记录只读有限窗口** — 该视图对最新的二十个任务各读一页已保存投递记录,并在提示条中说明;更早的任务不会被读取。
- **删除只在原地反馈** — 确认删除后,该行与详情要等一次权威读取确认移除才消失,失败则保留该行以便重试;目前没有应用级通知表面。
- **规则修改是比较并更新** — 面板提交它读到的记录,期间已变化的任务会以冲突返回,草稿保留到作者取消并重新打开为止。
- **静态模板目录** — 十二张卡片在本包内只是文案加一条重复规则;点击卡片会把它们填进同一个弹窗,而不是自行创建任务,卡片也不读取工作空间或已存任务。
- **完全访问工作空间还不是 Schedule 的选项** — 弹窗把该控件标为建设中(`aria-disabled` 并附原因),而不是收集一个创建请求无法携带的选择。

### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

模式 id 已加入 ui-layout 的 frame `AppModeId` 词表,共享应用头部从自己的映射表解析模式标题——保持入口、页面与该表的模式 id 及 locale 命名空间(`automation`)完全一致,否则会漂移。本模式下的侧边栏列由 frame 的 sidebar 可见模式集合(ui-layout 的 `AppFrame`)保持挂载,而非本包。目录源属于本包:它经客户端 Remote 装配读取 `schedule/catalog`、`schedule/delete` 与 `schedule/history`,并把缺失的 Host 能力表示成自己的状态。`schedule-format.ts` 与 `task-cron.ts` 移植自 upstream Schedule UI 的纯格式化器,因此同一条已存规则在两个界面上读法一致。

</details>
