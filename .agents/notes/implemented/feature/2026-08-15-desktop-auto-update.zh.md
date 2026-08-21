# Agent Note: 基于 GitHub Releases 的桌面更新

Status: implemented

[English](2026-08-15-desktop-auto-update.md) | 中文

## 问题

打包后的桌面壳层需要发现新版本、选择与操作系统和架构匹配的安装包，并让用户控制下载与重启。源码启动没有可替换的已安装应用，未签名的 macOS 构建也无法可靠地把更新交给操作系统。仓库的 `dsh-v<version>` 标签还带有产品前缀，electron-updater 读取 GitHub Atom feed 时不会把它识别为 SemVer。

## 决策

Electron 主进程通过 `electron-updater` 和 `apps/desktop/electron-builder.yml` 声明的 GitHub Releases provider 持有更新发现。`apps/desktop/src/update.ts` 把 provider 封装在可注入的 driver 后面，并显式提供 `disabled`、`idle`、`checking`、`available`、`downloading`、`downloaded` 与 `installing` 状态。源码启动保持禁用。控制器关闭 provider 的自动下载和退出时自动安装，仅允许从 `idle` 发起检查，在等待 provider 前先进入 `downloading`，并把检查、下载和安装程序交接失败收敛到可重试状态。

`desktop` 设置命名空间在关闭到托盘偏好旁保存自动检查、发布通道和自动下载。打包启动会在 15 秒后检查一次，并在启用自动检查时每六小时重复。`follow` 跟随已安装版本的类型，`stable` 拒绝预发布版，`rc` 接受预发布版。自动下载永远不代表自动重启。

仓库为 electron-updater 的 GitHub provider 维护一个 pnpm 补丁。补丁只在校验和比较 feed 版本或推导通道时移除受控的 `dsh-v` 前缀；构造 Release 与资产 URL 时仍保留原始标签。预发布版发现保留 electron-updater 的通道选择。仅稳定版发现会扫描 Atom feed，在 `dsh-v` 与旧版 `v` 标签中选择 SemVer 最高的非预发布版本，且不会请求 GitHub 的 `/releases/latest` 端点。

`DesktopBridge.updates`、对应 IPC 通道和 preload 在主进程与 `@deepseek-ai/dsh-client-ui-sdkwork-updater` 之间传递状态与动作。IPC handler 在加载 renderer URL 前注册，renderer 会收敛初始状态查询失败。客户端插件提供横幅、一项通用设置行和托盘中可选的手动检查动作。下载中和已下载横幅不可关闭，动作守卫会阻止重复检查、下载与安装。

当前 macOS 产物未签名，因此会声明 `canInstall: false`：更新发现和发布说明仍然可用，但 UI 会引导用户前往 GitHub Release 页面手动安装。Windows 与 Linux 构建提供下载和安装程序交接。Web 组合不包含 updater 包或桌面 bridge。

[统一原生发布工作流](../process/2026-08-15-unified-native-release-assets.md)会在同一个 GitHub Release 中发布各平台安装包、规范化的 electron-updater 元数据、架构特定的 macOS blockmap 和汇总校验和。元数据缺失或不一致会阻止发布。

## 备选方案

**在 renderer 获取 GitHub Release。** 这会重复发布选择逻辑，把网络与安装程序权限移入沙箱 UI，并绕过 electron-updater 的平台校验与交接。

**使用 Electron 内置的 Squirrel updater。** 桌面分发使用 NSIS 和 Linux 目标，需要 electron-updater 的 provider 与打包支持。

**只把 Release 页面作为更新机制。** 发布页仍是手动兜底，但无法提供静默发现、发布通道选择、下载进度或安装程序就绪后的受控重启。

**自动安装每个已发现更新。** Agent 会话可能仍在运行，因此下载与重启保持为两个用户选择。更新器不会在无关的应用退出时安装。

**重命名产品标签以满足 electron-updater。** `dsh-v` 命名空间用于区分产品发布与 package family 标签。窄范围 feed 规范化既保留该发布分类，也保留原始 GitHub URL。

## 后果

打包用户无需向 renderer 暴露仓库凭据即可收到更新提示，并可选择只接收稳定版或同时接收预发布版。在发布工作流提供签名与公证前，macOS 候选版本需要手动安装；其他受支持桌面目标可以下载并交接选定安装包。每个运行中的打包应用只会偶尔发起未认证的 GitHub 请求，每个 Release 都必须保留已安装客户端消费的元数据与校验和。

## 验证

Updater 测试覆盖状态迁移、调度、实时设置、重复动作守卫、仅手动安装构建、provider 与安装失败、IPC 顺序、托盘失败收敛和 renderer 展示。provider 级测试会解析代表性 GitHub Atom feed，验证候选版本发现保留原始资产 URL，并证明仅稳定版发现会选择最高稳定标签且不使用 `/releases/latest`。打包启动冒烟测试会加载随包分发的 preload bridge 与客户端 bundle。快照工具没有 Electron preload 通道，因此桌面专用横幅没有装配后的浏览器快照。
