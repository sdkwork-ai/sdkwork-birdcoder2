# Agent Note: 原生桌面发布产物矩阵

Status: implemented

[English](2026-08-14-desktop-release-artifact-matrix.md) | 中文

## Problem

桌面发布 workflow 必须提供一致的便携格式、Linux 发行版安装包、每种受支持 CPU 架构的覆盖，以及一份可由机器校验的已发布字节清单。

## Decision

workflow 在原生 GitHub 托管 runner 上为每个支持的桌面目标打包。矩阵包含 Windows x64 与 arm64、macOS x64 与 arm64，以及 Linux x64 与 arm64，由固定的目标集 `mac-arm64`、`mac-x64`、`win-x64`、`win-arm64`、`linux-x64`、`linux-arm64` 命名。Windows 生成 NSIS 安装程序和 ZIP 压缩包；macOS 生成 DMG 和 ZIP 压缩包；Linux 生成 AppImage、DEB、RPM 和 `tar.gz` 压缩包。builder 将产品、版本、操作系统和架构写入每个文件名，因此产物合并到一个 release 后仍然不会产生歧义。macOS 发布分别对应架构的产物，因为打包应用含有 native 模块，托管 ARM runner 上的 universal builder 无法可靠合并这些模块。

Desktop 工作流只用于复用和手动运行。[统一发布工作流](2026-08-15-unified-native-release-assets.zh.md)会在 `birdcoder-v<version>` tag 上调用它，并将矩阵与容器资产一起发布。每条 lane 只打包一个目标，只暂存该目标声明的文件，并在上传前校验这份文件名集合，因此打包回归会在这条 lane 上直接失败，而不是等到汇总阶段才表现为缺失资产。release 汇总器随后拒绝缺失或多余文件，通过结构化 YAML 合并 Windows 与 macOS 的 x64 和 arm64 updater 条目，保留架构特定的 Linux channel 文件与 macOS blockmap，并写出汇总 `SHA256SUMS`。必须使用原生 runner，因为打包应用含有平台相关依赖，x64 交叉构建无法证明 arm64 产物能启动：每个目标都会拒绝无法执行其打包运行时的构建宿主，Windows 还会以 `BCJ` 过滤器打包，因为随包的 NSIS 解码器无法读取 7-Zip 自动生成的 ARM64 过滤条目。

[electron-builder 配置](../../../../apps/desktop/electron-builder.config.mjs)是每条 lane 唯一的配方来源。产品与可执行文件都命名为 BirdCoder，每个产物命名为 `BirdCoder-${version}-${os}-${arch}.${ext}`，updater feed 使用 `github` provider，以便 electron-builder 写出 release 所需的平台 channel 文件——`publish` 为 `null` 会完全抑制该文件，而不是回退到仓库元数据。macOS 的 DMG 也参与这份元数据：`dmg.writeUpdateInfo: false` 会连带丢掉 DMG 的 blockmap 和它在 channel 文件中的条目，而汇总器要求每个 channel 文件恰好列出该目标的 updater 格式。无论是否签名，每条 lane 的应用标识都来自 `DSH_DESKTOP_APP_ID`。

代码签名和 macOS notarization 仍属于部署输入。`--unsigned` 是六个目标都可用的逐目标打包模式，而不是 Windows 专用的逃生口：它会去掉证书与 notarization 输入，并传递到运行时准备子进程，使 macOS 运行时在没有发行身份的情况下生成，同时不写出 COS 自动更新 release 记录。因此未签名 lane 不会声称产物已经 notarize，而已签名的 Windows 与 macOS lane 仍保留证书发现与签名后校验。

## Alternatives considered

**在 x64 runner 上交叉构建 arm64 目标。** 不采用，因为可选的 native 依赖和 Electron 平台二进制可能按宿主机而不是目标架构选择；构建显示成功也不能证明交付的应用能在 arm64 上启动。

**从 ARM runner 发布一个 universal macOS 产物。** 不采用，因为 x64 暂存应用会继承 workspace 安装中的 ARM native 模块，`@electron/universal` 会拒绝重复的 Mach-O 文件。分别发布 x64 与 arm64 产物可以保留每个目标所需的正确 native 模块。

**每个操作系统只保留一种安装格式。** 不采用，因为单一格式不能同时覆盖受管控安装和下载即运行的场景，而 Linux 用户通常需要自包含的 AppImage 与发行版安装包两者。

**在这次改动中加入签名和 notarization 凭据。** 不采用，因为证书、notarization 凭据和组织信任策略属于部署密钥，不是仓库默认值。产物矩阵保持确定性，后续发行策略变更可以在此基础上接入这些密钥。

**为每个平台拆成独立 workflow。** 不采用，因为重复的发布和 checksum 逻辑会让平台 lane 逐渐漂移；单一矩阵把覆盖范围和发布规则集中在一个位置，便于审查。

## Consequences

每个带 tag 的 dsh release 都会携带六种带架构标识的目标组合、Windows、macOS 和 Linux 安装及便携产物、更新元数据和 checksum。矩阵执行时间更长，也依赖原生托管 runner 标签的可用性，但平台特有的失败会在发布前暴露。若发行基础设施没有提供签名和 notarization 配置，发布文件仍然是未签名的；商业化交付在把构建视为已 notarize 之前，必须补充这些凭据并校验最终信任元数据。
