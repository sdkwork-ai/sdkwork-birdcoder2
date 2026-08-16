# Agent Note: BirdCoder 发布标签

Status: implemented

[English](2026-08-16-birdcoder-release-tags.md) | 中文

## 问题

本仓库的 GitHub Release 沿用了上游的 `dsh-v` 标签前缀（如 `dsh-v0.1.0-rc.12`），而打包后的产品及其下载 URL 均已冠名 BirdCoder。发布工作流的触发条件、npm release family 前缀、GitHub Latest 选择器、桌面自动更新器和安装文档都带着与产品身份不符的标签形式。

## 决策

规范的发布标签前缀现在是 `birdcoder-v`。推送 `birdcoder-v<version>` 会运行[发布工作流](../../../../.github/workflows/container-release.yml)，并发布包含完整 Desktop 与容器资产集的统一 GitHub Release。[families.ts](../../../../scripts/release/families.ts) 中 dsh release family 的 `tagPrefix` 为 `birdcoder-v`，因此 npm 发布校验和 tag 提升与 GitHub Release 使用同一套标签。

[Latest 选择器](../../../../scripts/release/select-github-latest.ts)与[打补丁的 electron-updater GitHubProvider](../../../../patches/electron-updater@6.8.9.patch)继续识别旧的 `dsh-v` 和 `v` 前缀：已发布的 Release 仍可参与 Latest 指针的选择，也仍能被桌面更新器发现。优先级相同时，规范的 `birdcoder-v` 标签胜出。更新器测试保留了一条旧的 `dsh-v` feed 条目，以证明向后兼容。安装文档、下载 base URL 和桌面资产指南现在统一使用 `birdcoder-v<version>`。

## 备选方案

**继续使用 `dsh-v` 标签。** 该前缀先于 fork 品牌存在；每个 Release、下载 URL 和文档都会继续与 BirdCoder 产品名不一致。

**只改 GitHub Release 触发条件。** npm family 前缀会与工作流触发条件不一致，从同一标签手动发布 npm 会失败于发布校验门禁，Latest 选择器也会把新标签当作无关标签。

**放弃旧标签支持。** 已发布的 `dsh-v` 和 `v` Release 会从 Latest 选择和桌面更新检查中消失，造成已发布版本的回归。

## 后果

`birdcoder-v<version>` 标签现在会创建完整的 GitHub Release 资产集；`dsh-v` 和 `v` 标签不再触发新 Release，但仍可作为版本排序和更新来源被读取。所有文档与测试 fixture 均引用 `birdcoder-v` 形式。
