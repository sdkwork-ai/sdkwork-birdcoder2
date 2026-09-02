---
description: "面向宿主的包管理器构建运行与输出流式推送：sdkworkAppBuild 服务按受理请求各起一个构建进程，为迟到跟随者缓冲帧，并通过整树击杀实现取消。"
kind: "package-reference"
---

# @deepseek-ai/dsh-sdkwork-app-build

[English](README.md) | 中文

## 概述

一键打包的宿主能力：`sdkworkAppBuild.start` 校验构建目录（绝对 cwd、可读的 `package.json`、脚本存在），根据目录中现有 lockfile 解析包管理器（`pnpm-lock.yaml` → `pnpm run`、`yarn.lock` → `yarn run`，否则 `npm run`），以 `shell: true` 且禁用颜色的方式拉起构建，并把每一帧——`started`、`output`（按行切分的 stdout/stderr）与唯一的终止帧 `exit`——记入每个构建独立的定容缓冲。跟随者通过 `follow(buildId, signal)` 接入：缓冲历史按已送达下标重放，活帧随发随达，迭代在 exit 帧之后立即结束；中止信号只是安静地断开跟随，从不终止构建。`cancel(buildId)` 请求整树击杀（win32 用 `taskkill /T /F`，其余平台对进程组发 SIGTERM），并让进程自己的退出路径发出终止帧；宽限期兜底逃逸树枚举、仍持有 stdio 管道的孙进程。并发上限为三个运行中的构建；已结束记录保留最多二十条，迟到跟随者与 `status(buildId)` 依旧可答。本缝之上的线协议面是 [`sdkwork-app-build-controller`](../../api/sdkwork-app-build-controller/README.zh.md) Remote；本包不拥有传输层。

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

在宿主 profile 中挂载服务（组合 web-app bundle 时由控制器的 `static inject = ['sdkworkAppBuild']` 完成），并按 `buildId` 寻址构建。`start` 抛出带五种错误码之一的 `SdkworkAppBuildError`——`cwd-unreadable`、`no-package-json`、`script-missing`、`build-unknown`、`concurrency-exceeded`——且校验全部发生在拉起之前，不会留下半注册的记录。脚本参数按惯用的 ` -- ` 分隔符追加，且必须匹配安全字符集，因为命令会不经引用地拼入 shell 字符串。

<a id="understand-the-implementation"></a>
## 理解实现

每个受理请求对应一条 `BuildRecord`，持有帧历史：`started` 固定在下标 0，缓冲达到两千帧后最老的输出行先被丢弃，`finish` 幂等保证 exit 帧恰好发出一次。跟随者经由每记录的监听器集合唤醒；每一帧都在监听器运行之前同步落入历史，因此按已送达下标的重放不会与活帧重复。已结束记录按开始时间保留最近二十条。

<a id="further-exploration"></a>
## 进一步探索

- [`types.ts`](./src/types.ts) — 与控制器共享的帧词汇与错误码。
- [`tests/runner.spec.ts`](./tests/runner.spec.ts) — 校验/拉起/跟随/取消路径的真实进程覆盖，含 leaf 逃逸取消竞态。

<a id="model-experience"></a>
## 模型体验

build id、命令与 cwd 随 `started` 帧下发，叙述打包过程的智能体可以引用确切命令；output 帧保留 stdout/stderr 区分，便于错误归因。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- 在构建最初的片刻（包管理器进程链还在拉起 leaf 时）取消，可能让该 leaf 逃过击杀并在后台跑完；记录仍会报告 `cancelled`、UI 保持正确，但进程没有被提前回收。
- 暂不支持按构建覆写环境变量、workspace 过滤与构建日志落盘；输出仅存在于定容帧缓冲中。

<a id="dev-note"></a>
## 开发备注

本包为遵循仓库命名契约的 fork 包（带 `sdkwork` 标记）。控制器在本地声明线协议词汇——typert 生成器遇到跨包类型别名联合的重导出会崩溃，因此那里的类型是镜像而非重导出。
