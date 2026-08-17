# Agent Note: 为离线容器打包完整 Landlock 包集合

Status: implemented

[English](2026-08-17-landlock-container-offline-packing.md) | 中文

## Problem

容器镜像使用普通 npm 安装本地 tarball。只打包 Landlock entry 包会使其中的 `workspace:*` optionalDependencies 未解析，npm 因而以 `EUNSUPPORTEDPROTOCOL` 失败。使用 pnpm 打包平台包还可能移除已发布 launcher 的可执行权限。

## Decision

Docker 和 release verification 统一调用 `native/landlock-run/scripts/pack-release.mjs`。容器使用完整模式，并从 `/packs/landlock/*.tgz` 安装 entry 包和两个平台包；本机 release rehearsal 使用 `--current-platform-only`。平台包使用 npm pack 保留可执行权限，entry 包使用 pnpm pack 转换 workspace 依赖。

## Alternatives considered

**只打包 entry 包。** 普通 npm 会拒绝未解析的 workspace optionalDependencies，因此容器会在运行时验证前失败。

**所有包都使用 pnpm 打包。** pnpm 可能规范化平台文件权限并移除 launcher 的可执行位，因此平台包必须使用 npm pack。

## Consequences

Docker build 在 image smoke test 前验证与消费者相同的三包输入，不需要 registry 访问或 npm 发布。缺少平台 tarball、残留 workspace 协议或 launcher 不可执行都会提前失败。

## Testing

容器静态验证要求使用完整 packer、拒绝旧的 entry-only 命令，并要求 npm install 使用三个本地 tarball glob。Landlock packed-install verification 检查具体依赖版本、launcher 权限、字节一致性和安装后 launcher 行为。
