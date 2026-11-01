---
description: "BirdCoder 的角色与兴趣个性化：存放在 SDKWork IAM 账号上的角色与关注方向画像、首次引导弹窗、设置菜单行，以及未登录时使用的本地缓存。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-persona

[English](README.md) | 中文

## 概述

BirdCoder 客户端的角色与兴趣个性化能力。用户选择的角色、关注的兴趣方向、首次引导应答与可选字典都保存在已登录的 SDKWork IAM 账号上，并通过 `ctx.iam` 读取，因此选择会跟随用户跨设备、跨应用生效。本插件在 `shell.overlay` 上承载选择弹窗，绑定设置菜单的 `角色与兴趣` 行，并把本地 `ui-sdkwork-persona` 分区保留为离线与未登录缓存。

## 目录

- [存储与行为](#storage-and-behavior)
- [模型体验](#model-experience)
- [已知限制与待办](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

## 存储与行为

账号画像是权威来源：`GET`/`PUT`/`DELETE /app/v3/api/iam/users/current/persona`，通过 `ctx.iam` 暴露。字典同样归账号所有：弹窗只渲染 `persona_catalog` 返回的角色与兴趣 id，因此服务端禁用某一项无需客户端发版即可生效（已选角色被目录移除时视为未选择并重新进入引导）；目录读取失败时回退到内置列表。首次引导在每个账号上只弹一次：只要尚未选择角色、且用户没有应答过弹窗就触发，因此在一台设备上应答后，其它设备不会再被追问；配置了 IAM 时会先等待已保存会话恢复，账号已有角色的设备不会被误打扰。保存时把角色与兴趣列表合并为一次请求；账号写入被拒绝时弹窗直接报错，绝不把未保存的选择当成已保存缓存下来。只存在于缓存中的选择或应答（未登录时做的，或画像迁到账号之前做的）会在下一次登录启动时上传一次 —— 账号报告无选择而缓存有选择，正是需要迁移的情形。

角色 id 是展示用 id（`learner`、`employee`、`teacher`、`partner`、`manager`、`developer`、`creator`、`visitor`）。IAM 目录把有授权对应项的角色映射到已初始化的业务角色（`course_learner`、`apps_employee`、`course_instructor`、`apps_partner`、`ops_content_moderator`、`apps_guest`）；`manager` 与 `developer` 没有映射，仅作展示。本包只记录选择，不自行授予后端角色。

## Model Experience

无，因为本插件只保存账号画像选择并渲染客户端界面，不新增会话事件、工具、提示词分节或模型请求。

#### KV Cache 影响

无；本包既不组装也不发送供应商请求。

## Known Limitations and Deferred Work

- 弹窗只为本构建已知的角色与兴趣 id 渲染本地化文案。账号目录负责过滤与排序，本构建不认识的 code 在读取时会被丢弃而不是渲染成无标签项，因此新增一个全新 id 仍需要客户端发版，而禁用既有 id 不需要。
- 推荐类界面尚未消费账号画像。它们通过 IAM App SDK 读取；选择弹窗目前只负责记录。
- 没有后端调用去授予映射的 IAM 业务角色。`sdkwork-iam` 的角色目录负责初始化定义，后续的授权流程可以使用上面的映射。
- 打包桌面应用首次启动时，账户 onboarding 与本弹窗都是首次引导界面，而本弹窗注册更晚，因此会覆盖在 onboarding 之上。应答或关闭其中一个后另一个才可见；两者尚未串行编排。
- 未登录的本地会话只把选择保存在 Host 设置缓存中。它会在下一次登录启动时上传到账号；同一台机器上的两个未登录配置档案之间不共享该选择。

### Dev Note

<details>
<summary>给维护者的工作背景 —— 点击展开</summary>

本插件不在 `ctx` 上拥有服务：弹窗的打开由 settings-menu 的 `ctx.persona` 接缝承载，settings-menu 以“不可用”的默认值提供该服务，因此它的注入面与激活顺序无关。功能插件通过 `setSource` 安装真实数据源，并拿到一个恢复默认值的 disposer —— 这样 HMR 重新加载不会让菜单停在已经失效的数据源上。

`PersonaService` 把账号端口与缓存分区作为两个协作者：读优先使用最新的账号快照、回退到缓存；账号可用时写入账号，否则写入缓存；`service.start()` 安装两个订阅并由同一个 `ctx.effect` 持有，因此重新加载不会留下孤儿监听。账号同步会同时读取画像与字典，账号变化时作废进行中的读取，并在弹窗打开时重试失败的读取。账号端口在 `apply` 中基于 `ctx.iam` 构建 —— 生成式 IAM App SDK 客户端、base URL 与共享 TokenManager 都由 `ctx.iam` 持有，persona 包不会另建一条传输。

</details>
