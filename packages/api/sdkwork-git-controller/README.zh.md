---
description: "SDKWork git Remote：在 sdkworkGit seam 之上的仓库状态、本地分支、图谱日志与分支检出，带 payload 校验与 git/* wire 码。"
kind: "package-reference"
---

# @deepseek-ai/dsh-api-sdkwork-git-controller

[English](README.md) | 中文

## 概述

宿主 Remote 命名空间 `sdkworkGit`，架在 [`sdkwork-git`](../../host/sdkwork-git/README.zh.md) seam 之上：`status`、`branches`、`checkout`、`createAndCheckout` 与 `log`。每个方法在触碰 seam 前先用 zod 校验 payload — 所有请求要求绝对 cwd，checkout/create 的分支名非空且不含空白或前导短横线，log 的 limit 为 `[1, 200]` 内的整数 — 并把 seam 拒绝投影到闭集 `git/*` wire 词汇（`git/cwd-unreadable`、`git/not-a-repo`、`git/branch-name-invalid`、`git/checkout-failed`、`git/command-failed`）；其余一律 `gateway/internal`。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>

## 使用本包

在宿主组合中于 seam 之后挂载 controller（web-app bundle 行声明 `inject: [sdkworkGit]`）；typert 生成器在构建时产出宿主面与浏览器 Remote client。浏览器侧消费已挂载的 `remote.sdkworkGit` 命名空间；`ui-sdkwork-git` 将其适配为结构化 port。

<a id="understand-the-implementation"></a>

## 理解实现

controller 只拥有 wire 词汇：请求形状在 `src/types.ts` 本地声明（typert 生成器要求每个 frame 成员在拥有包内解析 — 跨包 re-export 会使它崩溃），seam 结构相同的类型从不 re-export。校验是唯一逻辑；每个方法在 `safeParse` 之后都是直通。

<a id="known-limitations-and-deferred-work"></a>

## 开发备注

本包是遵循仓库命名契约的 fork 包（带 `sdkwork` 标记）。controller 在本地声明 wire 词汇 — typert 生成器在跨包类型 re-export 上会崩溃，因此 seam 类型在此是镜像而非 re-export。

## 运行时不变量

不发布运行时不变量伴随检查；controller 是无状态 seam 之上的无状态校验器。

## 模型体验

无：该命名空间是 git seam 之上的校验与直通面；seam 的读取与检出不含任何模型可见注册。

#### KV Cache effect

无；仓库事实经 wire 抵达 UI，从不进入模型上下文。

## 已知限制与后续工作

- 该命名空间只有读取加检出；暂存、提交与 push/pull 随其下的 seam 一并暂缓。
