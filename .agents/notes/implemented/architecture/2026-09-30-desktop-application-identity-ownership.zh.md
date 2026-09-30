# Agent Note: The desktop shell owns its Electron application identity

Status: implemented

[English](2026-09-30-desktop-application-identity-ownership.md) | 中文

## Problem

Electron 以 `app.asar` 内清单的 `productName` 为打包应用命名，该字段缺失时回退到带作用域的包名 `name`。`apps/desktop/package.json` 只有 `"name": "@deepseek-ai/dsh-desktop"` 而没有 `productName`，而 electron-builder 自己的 `productName` 从不会写入那份清单——它只合并 `extraMetadata`。因此本应用与已安装的上游 DeepSeek Harness 桌面端都解析出 `app.name = '@deepseek-ai/dsh-desktop'`，共用 `%APPDATA%\@deepseek-ai\dsh-desktop`，而 Electron 由该名字派生出：

- Chromium 单实例锁，于是启动任一方都会把另一方当作重复启动而退出；
- `logs`、`keybindings.json` 与 `background-close-confirmed` 标记；
- Chromium 配置、Cookie 与缓存；
- 更新缓存 `%LOCALAPPDATA%\@deepseek-aidsh-desktop-updater`，其中一方下载的 `installer.exe` 正是另一方要运行的文件。

Windows 卸载进一步放大了问题：`installer/uninstall.nsh` 会删除 `%APPDATA%\${APP_PACKAGE_NAME}`，也就是那个共用目录，于是卸载任一方都会删掉另一方的配置。同一次合并还让上游标识留在了另外三处：`dsh://` 自定义协议、桌面 CLI 命令 `dsh`（启动脚本、macOS 的 `/usr/local/bin/dsh` 链接、Windows 的 PATH 条目、其注册表归属键与互斥体），以及 macOS 包路径 `DeepSeek Harness.app`——本分支的打包流程按它查找，而打包产物其实是 `birdcoder.app`。

## Decision

打包后的壳拥有 Electron 由应用身份派生出的每一项操作系统资源。`apps/desktop/scripts/desktop-application-identity.mjs` 保存本分支的取值，`apps/desktop/package.json` 声明 Electron 实际读取的那一项：

| 面 | 本分支取值 |
| --- | --- |
| `app.name`、userData、`logs`、`sessionData`、单实例锁 | `BirdCoder`，来自应用清单的 `productName` |
| 更新缓存 | `birdcoder-updater` |
| 自定义 URL 协议 | `birdcoder://open` |
| 桌面命令 | `birdcoder`、`birdcoder.cmd` |
| 命令归属 | `HKCU\Software\BirdCoder\Command`、`Global\BirdCoder.Command.<sid>`、`.birdcoder-command.json` |
| 卸载数据 | `%APPDATA%\${PRODUCT_NAME}` |

打包宁可拒绝出包也不发布这处冲突：构建配置在清单缺少 `productName` 时直接失败，其 `afterPack` 钩子会把清单从已构建的 `app.asar` 中读回来，并拒绝安装程序身份与清单身份不一致的任何流水线。因此为隔离而改名的流水线——Windows 安装程序检查与已安装更新资格验证——必须同时把名字写进 `extraMetadata.productName`，这两条流水线现在都这样做。`apps/desktop/tests/desktop-application-identity.spec.ts` 固定了清单字段、构建器协议、壳的协议与 `open-url` 处理、开发包标识、启动器名称、命令归属记录与卸载目标。

两条边界保持不变。Harness 主目录（`~/.dsh`、`desktop` profile、会话、凭据、设置）继续与 npm `dsh` CLI 共用：那是双方一致认可的数据，而非进程级资源，迁移它会丢弃所有既有用户的数据。Windows 卸载会删除本应用的 `%APPDATA%\BirdCoder` 与自己的更新缓存，并有意保留 `%APPDATA%\@deepseek-ai\dsh-desktop`——那是另一个已安装应用的 userData，拆分前版本留下的残余，是"绝不删除本应用并不拥有的数据"的代价（[卸载决策](2026-09-08-desktop-uninstall-preserve-dsh-home.md)，已更新）。

## Alternatives considered

**保持 `app.name` 不变，只在壳里固定 `app.setPath('userData')`。** 它仍让协议处理程序、更新缓存名与 CLI 命令名处于共用状态，而且把 userData 路径变成运行时细节——`app.getPath('logs')`、单实例锁与 Chromium 仍会经由一个没有任何配置拥有的名字来解析它。

**把带作用域的包改名为本分支专属名字。** `@deepseek-ai/dsh-desktop` 是本分支在工作区依赖图中的包身份、与上游的合并面，也是所有打包脚本与内置运行时解析的名字；为了影响 Electron 挑中的目录而改它，等于拿真实标识换派生标识。

**用 `extraMetadata.productName` 代替清单字段。** 未打包运行以及所有读取清单的工具都会看到带作用域的名字；清单字段让 Electron、构建器与仓库源码对同一个取值保持一致。

**改桌面命令名但保留 `dsh://` 协议。** 共用协议仍会让两个应用在每次启动时互相抢走处理程序。

**当只有本分支安装时删除 `%APPDATA%\@deepseek-ai\dsh-desktop`。** 无法从目录内容判定归属，而判断错误的破坏性后果是另一个应用的配置被删。

## Consequences

两个应用现在可以并存安装、运行、更新与卸载。各自拥有自己的 userData、单实例锁、日志、界面偏好、协议注册、`PATH` 上的命令与更新缓存；启动任一方都不再影响另一方，两个卸载程序也都不会删除对方的数据。

Windows 卸载程序会留下 `%APPDATA%\@deepseek-ai\dsh-desktop`，其中包含拆分前本分支版本的日志与界面偏好。用户从那些版本升级后使用全新的 `%APPDATA%\BirdCoder`：Harness 主目录保留其会话、凭据与插件，快捷方式、托盘与任务栏身份保持不变。桌面命令在两个平台都从 `dsh` 更名为 `birdcoder`，因此既有注册需要通过**管理 birdcoder 命令…**重新安装；此前的 `dsh.cmd` 指向本分支从未发布的那个可执行文件。

上述每个面都是合并稳定契约：[AGENTS.md](../../../../AGENTS.md) 记录了取值、校验命令，以及"上游合并丢掉 `productName` 时打包会失败、而不是悄悄恢复冲突"的原因。
