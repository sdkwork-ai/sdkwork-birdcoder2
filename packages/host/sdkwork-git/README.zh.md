---
description: "宿主本地 git 仓库读取与分支检出能力：sdkworkGit 服务校验目录，经 simple-git 以墙钟时限驱动 git CLI，报告状态、分支、图谱日志与检出结果。"
kind: "package-reference"
---

# @deepseek-ai/dsh-sdkwork-git

[English](README.md) | 中文

## 概述

面向会话头部 git pill 的宿主能力：`sdkworkGit.status(cwd)` 报告当前检出分支（游离 HEAD 为 null）、HEAD 提交、未提交文件数（一次 `git status` 报告的全部暂存、修改与未跟踪路径）以及 ahead/behind 计数；`sdkworkGit.branches(cwd)` 列出本地分支（当前分支在前，随后按名称排序）；`sdkworkGit.checkout(cwd, branch)` 在确认分支存在后切换到已有本地分支；`sdkworkGit.createAndCheckout(cwd, name)` 先经 `git check-ref-format` 校验名称，再创建并切换；`sdkworkGit.log(cwd, limit)` 返回最近提交的父拓扑与引用装饰（HEAD 分支、本地分支、对照 `refs/remotes` 分类的远程跟踪引用、标签）。每次调用在运行任何 git 命令前先校验目录（绝对路径、存在、是目录）及其仓库状态（经 simple-git 的 `checkIsRepo` 执行 `git rev-parse`）。git 子进程带 15 秒墙钟 block 超时运行，卡死的仓库不会挂住 wire。本 seam 之上的 wire 面是 [`sdkwork-git-controller`](../../api/sdkwork-git-controller/README.zh.md) Remote；本包不拥有传输。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>

## 使用本包

在宿主 profile 中挂载服务（组合的 web-app bundle 中由 controller 的 `static inject = ['sdkworkGit']` 完成），以绝对仓库目录调用五个 seam 方法。失败抛出 `SdkworkGitError`，码为五个之一 — `cwd-unreadable`、`not-a-repo`、`branch-name-invalid`、`checkout-failed`、`command-failed` — 由 controller 投影到 `git/*` wire 词汇。

<a id="understand-the-implementation"></a>

## 理解实现

每次调用都构建绑定到解析后目录的全新 simple-git 句柄（无状态；不缓存仓库状态）。分支列表解析 `git branch --format=%(refname:short) %(objectname) %(HEAD)` — refname 不含空格，因此每行是名称、sha 与可选的 ` *` 标记。图谱日志解析 `log --pretty=format:%x1e…%x1f…` 的控制字符分隔行（哈希、父提交、作者、时间、%D 装饰、主题），并将装饰对照 `for-each-ref refs/remotes` 集合分类——本地分支可以合法包含斜杠，仅凭名称无法判断；HEAD 分支由 rev-parse 归属，不依赖装饰格式。`checkout` 在切换前先确认分支在本地存在，缺失分支以 `checkout-failed` 失败而不是泄漏原始 git 输出；`createAndCheckout` 在改动 HEAD 前先校验 ref 格式，以 `branch-name-invalid` 失败。

<a id="further-exploration"></a>

## 进一步探索

- [`types.ts`](./src/types.ts) — 与 controller 共享的 seam 词汇。
- [`tests/git-service.spec.ts`](./tests/git-service.spec.ts) — 在密闭临时仓库上的真实 git 覆盖：打开校验、状态计数、分支排序、检出、创建并检出、装饰分类与 limit 边界。

<a id="known-limitations-and-deferred-work"></a>

## 开发备注

本包是遵循仓库命名契约的 fork 包（带 `sdkwork` 标记）。分支列表与图谱日志解析 git 自身的输出格式（`branch --format` 行与 `log --pretty=format` 记录），因此升级 git 若改变这些格式，必须在同一次变更中更新解析器。

## 运行时不变量

不发布运行时不变量伴随检查；seam 每次调用无状态，所有失败都是闭集词汇拒绝。

## 模型体验

无：该能力只读取仓库状态并执行用户请求的检出；它自身不注册提示词、schema 或结果呈现。

#### KV Cache effect

无；状态、分支、图谱与检出结果经 wire 抵达 UI，从不进入模型上下文。

## 已知限制与后续工作

- 依赖宿主 PATH 上的 git CLI；没有 git 的组合中每次调用都以 `command-failed` 失败。
- 未出生仓库（尚无提交）中 HEAD 无法解析，`status` 失败；将其呈现为一等状态暂缓。
- 仅本地分支；远程跟踪分支与 push/pull 流程暂缓。
