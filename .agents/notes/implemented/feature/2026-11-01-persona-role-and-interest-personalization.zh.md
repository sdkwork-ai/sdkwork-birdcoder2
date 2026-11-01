# Agent Note: Persona role and interest personalization

Status: implemented

[English](2026-11-01-persona-role-and-interest-personalization.md) | 中文

## Problem

Fork 的「千人千面」需求要求应用知道使用者是谁 —— 学员、员工、老师、合作伙伴等 —— 以及这个人关注哪些方向，让推荐类界面能够塑造默认体验。改动前客户端完全没有角色模型：桌面 onboarding 在账户流程里只问了一个工作用途（`office`/`development`），没有任何地方持久化角色或兴趣列表，也没有任何界面让人修改它们。后端同样没有业务角色定义，授权流程无据可依。

两个约束决定了设计。持久化存储必须是 Host 已经按用户提供的设置分区，否则选择只活在页面内存里；而设置菜单的弹出菜单在 apply 时一次性装配，因此为它提供行数据的来源必须与插件激活顺序无关。

## Decision

部分决定已被[Persona profile on the IAM account](2026-11-02-persona-account-profile.zh.md)取代：持久存储从 Host 设置分区迁到 IAM 账号画像；下文记录的首次引导门槛、原子写入与设置菜单接缝仍然保留。

`packages/client/ui-sdkwork-persona`（`@deepseek-ai/dsh-client-ui-sdkwork-persona`）拥有个性化能力。它的 Host 半部声明持久的 `ui-sdkwork-persona` 分区 —— `role`（八个 persona id 的封闭联合）、`interests`（兴趣 id）与 `promptDismissed` —— 作为 volatile 字段，使浏览器作用域可读可写。它的浏览器半部绑定 `ctx.configForms`，自身不提供服务，把选择弹窗挂在 `shell.overlay` 上，并做三件事：把当前选择投影到 settings-menu 的 persona 接缝、运行一次性首次引导闩锁、通过声明的 store 提供弹窗状态。

当分区就绪且可写、尚未选择角色、且提示未被关闭时，闩锁执行一次。未选择角色就关闭会写入 `promptDismissed`，使关闭成为持久事实；写入失败则提示仍然欠着，这是诚实的状态。保存时把角色与兴趣合并为一次原子命名空间写入；Host 拒绝或传输失败时弹窗保留草稿不关闭。

settings-menu 新增 `ctx.persona` 上的 `PersonaRuntime` —— 不可用默认值加 `setSource`，与 account、feedback 两个接缝一致 —— 以及 `角色与兴趣` 行：只有数据源报告可用时才渲染，文字取该数据源本地化的角色名。persona 插件通过 `setSource` 安装数据源并拿到恢复默认值的 disposer，因此重新加载的菜单不会停在已失效的数据源上。需要这些选择的消费方通过 `ctx.configForms.get('ui-sdkwork-persona')` 读取分区；本包不导出弹窗 store。

IAM 侧八个不可变平台角色保持不动。九个行业与业务角色 —— `course_learner`、`course_instructor`、`course_assistant`、`course_reviewer`、`apps_employee`、`apps_partner`、`apps_guest`、`ops_support_agent`、`ops_content_moderator` —— 以 `roles.domainStandardRoles` 声明在 `courses`、`apps`、`ops` 三个模块清单里。`database/seeds/common/004_iam_role_catalog_seed.sql` 为租户 `100001` 初始化完整的已启用模块目录（八个平台角色加十五个域角色），id 与 materializer 生成的完全一致，zh-CN 语言覆盖提供它们的中文名。

## Alternatives considered

**让 persona 插件提供 `ctx.persona`，菜单直接读取。** 因激活顺序而放弃：设置菜单在 apply 时一次性构建注入面，因此在 persona 行更晚激活的组合里 `ctx.get('persona')` 会返回 undefined，该行会静默消失。接缝让菜单的注入面在有或没有该功能时都完整。

**把选择存到 IAM 账户档案上。** 因当前证据不足而放弃：设置文档是按 Host 配置档案的，且已经被提供；账户作用域存储需要后端档案字段与迁移。这一限制被记录而不是半成品实现。（后被推翻：账户档案已在关联记录中落地。）

**保留 `course_assistant` 里跨模块的 `messaging.*` 读取。** 在交付前移除：该角色位于 `courses` 清单，而 `IAM_MODULE_MANIFEST_SPEC` 只允许在声明依赖并获治理批准时授予跨模块权限。该角色在本域内保持只读。

**复用现有的空会话 onboarding 协调器。** 因该协调器只在当前会话为空时挂载而放弃：启动后直接恢复已有会话的场景永远不会弹出提示。

## Consequences

下次启动时每位既有用户都会看到一次弹窗；Web e2e 脚手架在其 fixture 部署层里应答了它，使无关场景不会启动在弹窗之后。选择现在保存在 IAM 账户上（见关联记录）；Host 分区是离线与未登录缓存。不会发生任何后端授权：角色映射是文档加 IAM 目录。打包桌面端首次启动时，由于注册更晚，弹窗会覆盖在账户 onboarding 之上；两个首次引导界面尚未串行编排。

## Testing

`packages/client/ui-sdkwork-persona/tests` 覆盖 Host 分区、settings-menu 接缝（安装、投影、恢复）、首次引导闩锁、原子写入以及弹窗行为，达到逐文件 100% 覆盖率。settings-menu 的规格覆盖新增行与运行时数据源的生命周期。IAM 侧用模块清单校验器、数据库框架标准检查与契约对齐检查验证。
