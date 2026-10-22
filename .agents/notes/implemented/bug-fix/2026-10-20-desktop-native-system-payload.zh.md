# Agent Note: 桌面端随包提供原生系统负载

Status: implemented

[English](2026-10-20-desktop-native-system-payload.md) | 中文

## 问题

`@deepseek-ai/node-addon-system` 掌管 POSIX 会话锁（`./flock`）与 Linux Landlock 启动器，并通过入口包声明为可选依赖的平台包解析各自的二进制：`@deepseek-ai/node-addon-system-<platform>-<arch>`（[平台包](../architecture/2026-09-07-prebuilt-system-primitives.zh.md)）。桌面端打包只把入口包放进 `packed/landlock`，运行时的 `pnpm install --prod` 因而向仓库索取平台包。仓库里只有 0.1.2，而本检出固定 0.1.5-alpha.2，`~0.1.5-alpha.2` 范围解析不到任何版本，pnpm 把无法解析的可选依赖当作不存在。物化出的运行时因此缺少 addon 与启动器，随后每个申请会话写租约的进程都以 `Cannot find module '@deepseek-ai/node-addon-system-linux-x64/package.json'` 终止：既包括在 POSIX 上真正加锁的准备阶段运行时冒烟，也包括安装在 `/opt/BirdCoder/resources/app.asar/dsh` 下的应用。Windows 从未出现该缺陷，因为它没有平台包，`./flock` 在那里继续使用 koffi 信号量，而 Landlock 只存在于 Linux。

## 决定

`package-target.ts` 构建宿主的原生负载（`pnpm --dir native/system run build:native`），并用 `native/system/scripts/pack-release.mjs --current-platform-only` 把宿主平台包与入口包一并打包——[容器镜像](../process/2026-08-17-landlock-container-offline-packing.zh.md)已在使用的打包器，以及「平台包用 npm、入口包用 pnpm」的规则。平台 tarball 进入桌面端包集合，其 `file:` override 取代入口包的仓库版本范围，因此 `node_modules/@deepseek-ai/node-addon-system-<platform>-<arch>/` 连同 `bin/` 负载成为物化运行时的一部分。Windows 仍只打包入口包：它没有平台包，而 `pack-release.mjs` 通过 PATH 解析 `pnpm`，Windows runner 上该命令写作 `pnpm.cmd`。

`prepare-dsh.ts` 拒绝缺少目标平台包的 POSIX 运行时，缺少负载的包集合在打包阶段失败，而不是交付一个无法为会话加锁的应用。

`electron-builder-config.mjs` 解包 `**/node_modules/@deepseek-ai/node-addon-system-*/bin/**/*`，`launcherPath()` 会把解析结果中的 `.asar` 段改写为同级的 `.asar.unpacked` 目录。`bin/landlock-run` 没有扩展名，既有原生二进制模式匹配不到它，而归档内的可执行文件无法被启动；addon 继续由 `**/*.node` 匹配。

Linux 各条线安装 `musl-tools`，因为启动器是静态 musl 可执行文件，而 musl addon 是绑定的第二份副本。

## 备选方案

**发布平台包并继续从仓库解析。** 每次桌面端构建都将依赖另一个发布工作流先发布精确固定的版本，而从任意其他提交构建仍会产出缺少锁的运行时；自包含运行时不应在安装期从仓库解析原生能力。

**不构建宿主负载就直接打包平台包。** 其 prepack 校验会拒绝缺少已声明二进制的包，因此在打包期失败，而不是交付一个空包。

**缺少 addon 时退回纯 JavaScript 锁。** 入口包的契约是拒绝获取而不是授予无保护的锁，纯 JavaScript 锁会改变会话写租约所依赖的语义。

**解包整个平台包。** `prebuilds.json` 与 README 是加载器从不执行的归档内容，因此更窄的模式让解包树保持最小。

## 后果

Linux 与 macOS 打包需要与目标架构一致的构建宿主、C 编译器，Linux 上还需要 `musl-tools`；Windows 与 Linux 上架构不符的宿主在准备工作开始前就被拒绝，macOS 上架构与目标不符的宿主则在 `prepare:dsh` 处点名缺失的平台包并失败。运行时增加一个启动器与两份 addon 副本。打包后的应用重新获得会话锁与 Landlock 启动器；运行时冒烟在两个 POSIX 目标上真正加锁，并要求 Linux 启动器位于解包目录。
