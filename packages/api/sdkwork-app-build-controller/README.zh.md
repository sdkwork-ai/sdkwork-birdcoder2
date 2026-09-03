---
description: "sdkworkAppBuild 构建执行缝之上的 Typert Remote 面：带 start/follow/cancel 动词的 sdkworkAppBuild 命名空间、zod 校验请求、流式构建帧与闭集 app-build/* 错误码。"
kind: "package-reference"
---

# @deepseek-ai/dsh-api-sdkwork-app-build-controller

[English](README.md) | 中文

## 概述

一键打包的 Remote 线协议面。控制器继承 `TypertRemoteService`，命名空间为 `sdkworkAppBuild`，暴露三个动词：`start`（zod 校验绝对 cwd、可选脚本名、可选安全字符集参数）返回拉起事实；`follow` 为 `mode: 'stream'` 动词，产出构建的帧流（`started`、`output`、`exit`），直到 exit 帧或客户端中止；`cancel` 请求整树击杀。能力错误映射到闭集线协议错误码——`app-build/cwd-unreadable`、`app-build/no-package-json`、`app-build/script-missing`、`app-build/build-unknown`、`app-build/concurrency-exceeded`——通过本包 `types.ts` 中对 `RemoteErrorDetailsMap` 的模块扩充注册。线协议词汇（帧、请求、值）在本地声明而非从缝包重导出，因为 typert 生成器无法解析跨包类型别名联合。构建执行本身完全位于 [`dsh-sdkwork-app-build`](../../host/sdkwork-app-build/README.zh.md)；本包只加校验、错误映射与 typert 面，生成的客户端贡献由 [`api-remotes`](../../api/remotes/README.zh.md) 组装挂载。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

客户端经 remotes 组装消费生成的命名空间（`ctx.remote.sdkworkAppBuild.start/follow/cancel`），不直接导入本包——生成的 `./remote` 模块按仓库的 `GENERATED_REMOTE` 规则内联进客户端 bundle。`follow` 接收 build id 与中止信号并返回原生异步可迭代对象；中止只是安静地结束消费，断开跟随而不取消构建。

<a id="understand-the-implementation"></a>
## 理解实现

校验以 zod 为先：cwd 必须绝对，脚本名匹配带长度上限的严格标识符模式，参数在数量与长度上受限且必须匹配安全字符集——畸形请求在抵达缝之前就被控制器拒绝。`buildFailure` 经由 `satisfies Record` 映射表把 `SdkworkAppBuildError` 错误码映射到线协议注册表；其余失败一律落到 `gateway/internal`，意外错误永不外泄其形态。

<a id="further-exploration"></a>
## 进一步探索

- [`types.ts`](./src/types.ts) — 本地线协议词汇与 `app-build/*` 错误码的 `RemoteErrorDetailsMap` 扩充。
- [`../../host/sdkwork-app-build/README.zh.md`](../../host/sdkwork-app-build/README.zh.md) — 本面所投影的执行缝。

<a id="model-experience"></a>
## 模型体验

错误码稳定且具体，智能体可以区分"目录不对"、"缺构建脚本"与"构建太多"，无需解析消息文本就能准确告知用户如何修正。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- 注册表为闭集：新增失败码需要同时修改这里的 `RemoteErrorDetailsMap` 扩充与映射表。
- 没有列举已结束构建的动词；客户端必须持有 `start` 返回的 build id。

<a id="dev-note"></a>
## 开发备注

本包为遵循仓库命名契约的 fork 包（带 `sdkwork` 标记）。线协议类型保持本地（镜像缝包的形态）——否则宿主面构建的 typert 生成会在 `FaceAnalyzer.packageExportName` 崩溃。

## 运行时不变量

不发布运行时不变量伴随检查；该控制器编排 app 构建任务，其顺序与结算归属 app-build 服务；控制器自身不新增可独立观察的状态。
