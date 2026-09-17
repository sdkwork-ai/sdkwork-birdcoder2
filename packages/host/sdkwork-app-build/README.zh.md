---
description: "面向宿主的包管理器构建运行与输出流式推送：sdkworkAppBuild 服务先探测本机究竟能跑哪些应用族命令，再按受理请求各起一个构建进程，为迟到跟随者缓冲帧，并通过整树击杀实现取消。"
kind: "package-reference"
---

# @deepseek-ai/dsh-sdkwork-app-build

[English](README.md) | 中文

## 概述

一键打包的宿主能力。`describe({ cwd })` 探测工作区 `apps/` 树下声明的各客户端应用族，并把**能力判定**挂在每个编译/打包脚本上：它能在哪些操作系统与 CPU 上运行、需要 PATH 上有哪些可执行文件、需要哪些环境变量组、以及它交给 `node`/`tsx` 的入口文件是否真的在树里。这件事只有宿主能答——渲染进程不是构建主机，而“脚本存在”与“脚本可跑”本来就是两件不同的事实。`sdkworkAppBuild.start` 校验构建目录（绝对 cwd、可读的 `package.json`、脚本存在、能力判定可满足），根据目录中现有 lockfile 解析包管理器（`pnpm-lock.yaml` → `pnpm run`、`yarn.lock` → `yarn run`，否则 `npm run`），以 `shell: true` 且禁用颜色的方式拉起构建，并把每一帧——`started`、`output`（按行切分的 stdout/stderr）与唯一的终止帧 `exit`——记入每个构建独立的定容缓冲。跟随者通过 `follow(buildId, signal)` 接入：缓冲历史按已送达下标重放，活帧随发随达，迭代在 exit 帧之后立即结束；中止信号只是安静地断开跟随，从不终止构建。`cancel(buildId)` 请求整树击杀（win32 用 `taskkill /T /F`，其余平台对进程组发 SIGTERM），并让进程自己的退出路径发出终止帧；宽限期兜底逃逸树枚举、仍持有 stdio 管道的孙进程。并发上限为三个运行中的构建；已结束记录保留最多二十条，迟到跟随者与 `status(buildId)` 依旧可答。本缝之上的线协议面是 [`sdkwork-app-build-controller`](../../api/sdkwork-app-build-controller/README.zh.md) Remote；本包不拥有传输层。

## 目录

- [使用本包](#use-this-package)
- [能力规则](#capability-rules)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在宿主 profile 中挂载服务（组合 web-app bundle 时由控制器的 `static inject = ['sdkworkAppBuild']` 完成），并按 `buildId` 寻址构建。`start` 抛出带六种错误码之一的 `SdkworkAppBuildError`——`cwd-unreadable`、`no-package-json`、`script-missing`、`build-unknown`、`concurrency-exceeded`、`command-unrunnable`——且校验全部发生在拉起之前，不会留下半注册的记录。`command-unrunnable` 就是能力守卫：目标平台不是本机（在非 Windows 上打 `package:win:x64`、在非 Apple Silicon 上打 `mac-arm64`）、工具链未安装（没有 Xcode 却打 `flutter build ipa`）、或入口文件不在树里（`node scripts/build-mini-program.mjs` 根本没有这个文件）的命令，都会被拒绝并指明缺什么，而不是拉起来必然失败。同一份判定也驱动菜单里的置灰行，因此过期的目录缓存或绕过菜单的调用方都到不了菜单本会拦下的运行。脚本参数按惯用的 ` -- ` 分隔符追加，且必须匹配安全字符集，因为命令会不经引用地拼入 shell 字符串。

<a id="capability-rules"></a>
## 能力规则

一条命令的“要求”来自一张规则表，键取**脚本名与它实际运行的命令行两者**切分出的整词——目标可能只写在名字里（`build:flutter-ios:prod` 的名字带 `ios`），也可能只写在命令体里（`flutter build ipa` 的体带 `ipa`；`tsx scripts/package-target.ts mac-arm64` 的目标只在体里）。规则按序匹配、首个命中给出整套要求，所以 `mac` + `arm64` 那条必须排在裸 `mac` 之前。匹配按整词而非子串：原先那版闸门把任何含 `ios` 字样的脚本一律当 macOS 专用。规则镜像应用根自己强制的约束，使目录与真实运行不可能互相矛盾——尤其 `apps/desktop` 的 `package-target.ts`：非 Windows 拒绝 `win-*`、非 Linux 拒绝 `linux-*`、非 macOS 拒绝 `mac-*`、非 Apple Silicon 拒绝 `mac-arm64`。判定在每次探测时对新鲜的主机事实重算，因此启动之后才装上的工具链会在下一次探测就被认出来。

<a id="understand-the-implementation"></a>
## 理解实现

每个受理请求对应一条 `BuildRecord`，持有帧历史：`started` 固定在下标 0，缓冲达到两千帧后最老的输出行先被丢弃，`finish` 幂等保证 exit 帧恰好发出一次。跟随者经由每记录的监听器集合唤醒；每一帧都在监听器运行之前同步落入历史，因此按已送达下标的重放不会与活帧重复。已结束记录按开始时间保留最近二十条。

<a id="further-exploration"></a>
## 进一步探索

- [`types.ts`](./src/types.ts) — 与控制器共享的帧词汇、能力要求/判定结构，以及错误码。
- [`capability.ts`](./src/capability.ts) — 主机事实、规则表与判定计算。
- [`tests/runner.spec.ts`](./tests/runner.spec.ts) — 校验/拉起/跟随/取消路径的真实进程覆盖，含 leaf 逃逸取消竞态。
- [`tests/capability.spec.ts`](./tests/capability.spec.ts) — 规则矩阵，以及用固定 Windows 主机读真实 `apps/` 树的验收。

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

## 运行时不变量

不发布运行时不变量伴随检查；构建记录有界、按 id 隔离，且由构造方式保证自洽。
