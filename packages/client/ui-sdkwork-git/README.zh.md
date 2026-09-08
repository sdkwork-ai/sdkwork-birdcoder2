---
description: "SDKWork git 插件：会话头部分支 pill（项目分支 + 未提交更改数），点击展开分支切换 popover（含搜索），并打开居中的创建并检出新分支弹窗与屏幕自适应 Git 图谱弹窗（SVG 泳道图 + 引用徽标）。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-git

[English](README.md) | 中文

## 概述

本插件在对话会话头部添加 git 分支 pill。pill 显示当前会话项目已检出的分支（分支名；游离 HEAD 时显示短提交哈希），点击展开 popover：

1. 分支列表：所有本地分支，当前分支排最前并带对勾；工作树有改动时，当前分支下方显示「未提交的更改: N 个文件」。
2. 搜索框：输入即过滤分支列表。
3. 「创建并检出新分支」：打开居中表单弹窗（分支名输入、仅基于 HEAD 的提示、取消/创建按钮；分支名由宿主侧 git ref-format 校验）。
4. 「Git 图谱」：打开居中的自适应弹窗（宽高各占视口 70%）：吸顶的 图/描述/日期/作者/提交 列头、由提交拓扑计算的 SVG 泳道图、引用徽标（HEAD、本地分支、远程跟踪引用、标签）以及刷新按钮。

检出分支会立即切换宿主仓库，pill 随后通过一次新的状态读取刷新。所有仓库信息经由 `sdkworkGit` Typert Remote 传输，由 `@deepseek-ai/dsh-sdkwork-git`（基于 simple-git 的宿主 git 能力）提供服务。会话没有项目目录、或宿主拒绝 git 读取时，pill 不渲染，无仓库的组合保持头部不变。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>

## 使用本包

将插件与宿主能力、Remote controller 一起挂载为 web-app bundle 的一部分（`packages/bundle/web-app/cordis.patch.yml` 中三行 roster：`sdkwork-git`、`sdkwork-git-controller`、`ui-sdkwork-git`，外加 web-app 与 desktop 清单中的工作区依赖）。删除 `ui-sdkwork-git` 行即移除 pill；只删除宿主行时插件保持挂载，但 Remote 命名空间无法提供状态，pill 保持隐藏。

<a id="understand-the-implementation"></a>

## 理解实现

- `src/client/index.ts` — 注册词典，并把 pill 贡献到 `conversation.session.header.actions` 席位（order `-10`，紧跟标题簇右侧、先于会话日志操作条）。port 由已挂载的 `remote.sdkworkGit` 命名空间一次性构建；缺少该命名空间的组合不挂载 pill。
- `src/client/gitPort.ts` — 生成 Remote 命名空间之上的结构化 `SdkworkGitPort`（status、branches、checkout、createAndCheckout、log），wire 失败展平为 Error。
- `src/client/GitBranchPill.tsx` — pill 与 popover。仅使用 React 状态：项目目录每次变化读取一次状态（会话 cwd 经 `useSessions` standard prop 获取）、popover 每次打开读取一次分支列表。面板 portal 到 `document.body`，用共享的 `useAnchoredPosition` 定位，外部 pointerdown 与 Escape 关闭；底部两行打开两个产品弹窗并收起 popover。
- `src/client/GitGraphModal.tsx` — 屏幕自适应（70vw × 70vh）图谱弹窗，架在共享 `Modal` 原语（headless）上：吸顶列头、每行一个 SVG 渲染泳道节点与指向下一行的边、引用徽标，以及重新读取日志的刷新按钮。
- `src/client/GitCreateBranchModal.tsx` — 居中创建弹窗，架在共享 `Modal` 原语上：自动聚焦的分支名输入、宿主拒绝在弹窗内呈现、成功后关闭并刷新 pill 状态。
- `src/client/gitGraphLanes.ts` — 泳道布局：每个提交渲染在承载它的泳道上，第一父提交沿节点泳道延续，其余父提交取第一个空闲泳道或汇入已承载它的泳道，被页界截断的父提交仍占其泳道以保留截断处的曲线。
- `src/client/GitBranchPill.module.css` — 触发器的 chip 视觉，面板复用菜单表面 token（`--dsw-specific-menu` + `--dsw-elevation-prominent`）。
- `src/client/locales.ts` — 插件自有的 `sdkworkGit` 词典命名空间（zh 为键集事实源，en 键一致）。

本插件只拥有呈现层；所有变更是用户发起、经宿主能力执行的检出。

<a id="known-limitations-and-deferred-work"></a>

## 开发备注

本包是遵循仓库命名契约的 fork 包（带 `sdkwork` 标记）。仅当 api-remotes 组合暴露 `remote.sdkworkGit` 时 pill 才挂载；header-actions 注册经延迟的 `slots.inject` 完成，fiber 销毁（HMR 替换）即移除。

## 运行时不变量

不发布运行时不变量伴随检查；该包是 UI 插件，其唯一的 slot 注册通过规格测试套件验证销毁（HMR 安全），pill 的渲染行为与两个弹窗经假 git port 覆盖，泳道布局另有独立规格测试。

## 模型体验

无：本包是浏览器侧的 git 呈现层；检出动词只改变宿主上的仓库状态，宿主 git 能力不注册任何面向模型的内容。

#### KV Cache effect

无；pill 只读取会话 store 行与宿主 git 读取结果，不组装也不修改 provider 请求。

## 已知限制与后续工作

- 图谱弹窗渲染最近窗口的拓扑（每次读取至多 200 行）；翻页加载更早历史与提交详情面板暂缓。
- git 报告与未提交更改冲突时检出被拒绝；popover 展示宿主错误信息。感知 stash 的流程暂缓。
- popover 仅列出本地分支；远程跟踪分支暂缓。
