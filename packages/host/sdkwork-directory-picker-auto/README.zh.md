---
description: "SDKWork 目录选择缝的自适应选择器：启动时对宿主情形采样一次，在有人值守的宿主上挂载 SDKWork 组合后端，对远程客户端挂载浏览后端。"
kind: "package-reference"
---

# @deepseek-ai/dsh-sdkwork-directory-picker-auto

[English](README.md) | 中文

## 概述

为 Web GUI 的每次启动挑选目录选择交互：它对宿主情形采样一次，并把匹配的后端与其浏览器面作为内存中根树的真实 Loader 条目一起挂载。有人值守的宿主得到[组合](../sdkwork-directory-picker-composed/README.zh.md)后端，因此工作区选择器仍是 OS 对话框，而受治浏览动词继续服务应用内界面；远程或无头情形得到[浏览](../directory-picker-browse/README.zh.md)后端，与[上游选择器](../directory-picker-auto/README.zh.md)一致。要钉死某种交互，直接组合该后端行即可。

## 目录

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## 使用本包

当同一份组合必须服务不同宿主时——原生选择器可用的本地工作站会话，以及只有应用内浏览器可用的远程或无头会话——组合本插件而不是某个具体后端。

### 选择如何做出

解析原样复用上游选择器的启动期采样——无远程权威信任、仅环回绑定、非 SSH 启动、以及可服务的显示会话，四者齐备才走原生分支；任何含糊情形都解析为 `browse`。仅原生分支不同：它挂载组合后端，因为桌面启动必须继续向应用内界面提供受治浏览线上动词。

### 你会得到什么

两个包都作为普通 Loader 条目创建，并随本插件一起拆除：后端注册 `ctx.directoryPicker`，其浏览器面由客户端模块表发现，与配置行的行为完全一致。移除按相反顺序进行，并 join 每个条目的 fiber 拆除，因此卸载选择器只会在两个面都静止后返回；挂载失败时先卸载已创建的内容再重新抛出，因此重试不会与自身的 `directoryPicker` 注册相撞。

<a id="understand-the-implementation"></a>
## 理解实现

`apply` 解析出一个后端种类，随后在 `ctx.effect` 内挂载 `BACKEND_PACKAGES[kind]` 与 `SURFACE_PACKAGES[kind]`，由该 effect 持有 disposer。

| 解析结果 | 后端 | 浏览器面 |
|---|---|---|
| `native` | `@deepseek-ai/dsh-sdkwork-directory-picker-composed` | `@deepseek-ai/dsh-client-ui-directory-picker-native` |
| `browse` | `@deepseek-ai/dsh-host-directory-picker-browse` | `@deepseek-ai/dsh-client-ui-directory-picker-browse` |

根树的 `commit(change)` 是空操作，因此这些行永远不会被写回配置文件。`BACKEND_PACKAGES` 与 `SURFACE_PACKAGES` 之所以导出，是因为这些引用是静态配置闸门在 `cordis.yml` 行里看不到的运行时字符串：每个组合本选择器的应用都必须把这些包名声明为依赖。

## 开发备注

暂无额外运维备注；契约以上方章节为准。

## Model Experience

无，因为该选择器只通过 Loader 挂载后端行与其浏览器面；它不注册任何工具、prompt 段或 Session 事件。

#### KV Cache effect

无；本包既不组装也不发送提供方请求。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- **平台行为委派给被挂载的后端**——本包负责采样与挂载；OS 选择器、受治目录列表以及所有平台差异都属于原生与浏览后端，解析错误以该后端自身的失败形式暴露，而不是选择器错误。
- **检测由启动上下文推断操作者位置**——脱离的 tmux 会话会丢失 `SSH_*` 标记，不在 Aqua 会话中的 Darwin 进程仍被算作有显示，而从工作站本地启动、事后经 `ssh -L` 访问的部署来自 `127.0.0.1`；对探测无法证明的部署，直接组合浏览或组合行是安全选择。
- **每次启动只采样一次**——一次解析服务该次启动的所有客户端；逐连接自适应需要缝不携带的逐客户端能力。
