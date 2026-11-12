# Agent Note：创建与安装流程背后的插件来源

Status: implemented

[English](2026-11-12-plugin-sources-create-and-install.md) | 中文

## Problem

插件云端目录列出的条目无法真正安装。每张卡片只带展示元数据和一枚服务端启用标记，却没有说明插件包在哪里，因此列表上的动作只是翻转一条记录，而不是安装代码。真实插件来自三处：压缩包（插件包的 zip 或 tar）、Git 仓库（常常是一个发布多个插件的仓库中的某个目录），以及 sdkwork-drive 目录。创建与安装流程也有同样的缺口：创建派发的提示词同时猜测插件包和它的位置，安装则只认识 pnpm 的注册表、Git、tarball 与本地路径 spec。

需求是让列表和两条流程都认识来源，同时保持一套插件标准：带 `dsh.bundle` 与 `cordis.patch.yml` 的组合包，经由插件管理器既有的流水线安装。

## Decision

插件来源成为一等描述，包含三种形式，所有表面都使用它：

- `git` —— https 仓库地址、可选引用、可选的插件目录。一个仓库可以发布多个插件，目录用于区分它们。
- `archive` —— http(s) 上的 zip 或 tar 压缩包、包内可选目录、可选 SHA-256。
- `drive` —— sdkwork-drive 目录，由持有凭据者解析成 Drive API 给出的 https 下载包；节点 id 保留用于展示。

`@deepseek-ai/dsh-plugin-manager/source` 以纯的、浏览器安全模块拥有这套标准。它校验描述、归一化各部分、拒绝可能逃出来源的目录，并渲染管理器本来就接受的安装 spec：

| 形式 | spec |
|---|---|
| git | `git+<url>#<ref>&path:/<directory>`（只给目录时引用为 `HEAD`） |
| archive | `<url>#path:/<directory>&sha256=<hex>`；路径本身不以压缩包扩展名结尾时用 `archive+<url>` |
| drive | `drive+<url>#path:/<directory>` |

管理器自己解析这些 spec：`archive` 与 `drive` 加入 `InstallSpecKind`，`inspect` 不下载就答复形式与 host，`installBundle` 在 pnpm 运行前把它们物化。`archive.ts` 在 profile 内下载、校验哈希、拒绝路径逃逸、限制下载（128 MiB）、解压（512 MiB、20,000 个文件）与单文件（64 MiB），经中央目录读取 zip、经头部读取 tar/tar.gz，取出指定目录或剥掉唯一的外层目录，然后把解压目录按本地路径安装——于是清单写入、`dsh.bundle` 校验、激活与回滚仍是同一条流水线。重复安装复用 `.plugin-manager/sources/<hash>`。

`ui-sdkwork-markets` 的两条流程共用同一个表单（`PluginSourceDialog`）：创建记录身份与来源，派发同时点名包标准与成品必须满足的安装 spec 的提示词；安装把表单得到的来源转成 spec，并通过插件 store 唯一的安装动作执行。云端目录的卡片走第三条路：内嵌的 App Store 页面现在公布每个条目的 `source`（来自 `metadata.pluginSource`，或旧的 `gitRepoUrl` 加可选目录）并显示来源标签；当嵌入宿主传入 `pluginsHost` 端口时，卡片动作通过 Host 安装插件包，而不是翻转服务端标记。BirdCoder 从 `MarketsPage` 传入该端口，由它归一化条目来源并打开 store 的安装会话。

## Alternatives considered

**让 pnpm 认识新形式。** pnpm 读不了任意 zip，而云盘目录在持有者解析前没有 URL。物化成本地目录保持了 pnpm 的安装行为（store、脚本、锁文件）不变。

**每个来源只给一个安装 spec 字符串，不做校验。** 市场可以公布任何内容，浏览器也无法在下载前拒绝逃出压缩包的 `path:`。把描述与渲染出的 spec 分开，使表单、目录和 Host 校验同一组字段。

**一个插件仓库只对应一个条目。** 发布多个插件的单仓库就不得不一个插件一个仓库，或在旁注里说明。目录是来源的一部分，因此两个条目可以指向同一仓库并安装不同的包。

**在 BirdCoder 内自建 App Store 目录。** 云端目录就是 App Store 自己的页面；替换它会重复搜索、分类与登录。嵌入面只增加一个可选端口，页面保留自己的外壳。

**让创建直接写文件。** 编写标准包正是对话与可用的插件创建技能所做的事；表单现在给它们身份、来源与验收检查，而不是一段空白提示词。

## Consequences

- Host 新增 `source.ts` 与 `archive.ts`、两个浏览器安全入口（`/source`、`/archive`），以及 `archive`/`drive` 两种安装形式。`inspect`、`installBundle`、失败归属的 host 检查与 `InstallSpecKind` 都覆盖它们；插件管理器套件（475 个测试，含一次从本地 HTTP 压缩包出发的真实 pnpm 安装）与新增的 source/archive 规格通过。
- Markets 页面新增来源弹窗、添加菜单行、为本地名册之外发起的安装准备的页面级安装弹窗，以及云端目录安装端口；client bundle 针对兄弟 App Store 源码重新构建通过。
- App Store 目录新增 `PluginSourceRef`/`PluginsHost`、从 `metadata.pluginSource`（旧 `gitRepoUrl` 回退）映射来源、可见的来源标签，以及卡片与详情弹窗上的安装动作。没有宿主的部署保留旧的启用开关。其 runtime 端口有四个规格，覆盖三种形式、回退与注册元数据。
- 没有来源的目录条目会打开来源表单，而不是猜测；云盘节点由调用方解析，插件管理器从不自行认证；压缩包安装不流式报告下载进度，并保留解压副本。
