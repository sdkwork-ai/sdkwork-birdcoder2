# Agent Note: 为离线容器打包完整 Landlock 包集合

Status: implemented

[English](2026-08-17-landlock-container-offline-packing.md) | 中文

## Problem

容器镜像使用普通 npm 安装本地 tarball。其 Landlock 输入必须同时包含 entry 包与两个平台包，并保留每个平台 launcher 的可执行权限。同一离线安装中的另一个独立故障暴露出已发布 SDKWork `0.1.0` manifest 的运行时依赖仍使用 `workspace:*`；普通 npm 会以 `EUNSUPPORTEDPROTOCOL` 拒绝这些 manifest。

## Decision

Docker 和 release verification 统一调用 `native/landlock-run/scripts/pack-release.mjs`。专用 native 矩阵会在匹配的 Linux runner 上构建两个受支持的 launcher，每个容器 image job 都会把两个 artifact 合并到 prebuilt context 后再使用完整模式打包。容器从 `/packs/landlock/*.tgz` 安装 entry 包和两个平台包；本机 release rehearsal 使用 `--current-platform-only`。平台包使用 npm pack 保留可执行权限，entry 包使用 pnpm pack 转换 workspace 依赖。

## Alternatives considered

**只打包 entry 包。** 即使 entry manifest 已包含具体 optional dependency 版本，离线镜像仍会缺少 entry 在运行时选择的平台包，安装后的 launcher 因而不完整。

**所有包都使用 pnpm 打包。** pnpm 可能规范化平台文件权限并移除 launcher 的可执行位，因此平台包必须使用 npm pack。

## Consequences

Docker build 验证与消费者相同的 Landlock 三包输入，不需要 registry 访问或 npm 发布。任何 packed runtime manifest 只要包含 `workspace:`、`catalog:`、`file:` 或 `link:` 依赖就会被拒绝。缺少平台 tarball、存在仅限本地的依赖协议或 launcher 不可执行都会在 image smoke test 前失败。

## Testing

容器静态验证要求使用完整 packer、拒绝旧的 entry-only 命令，并要求 npm install 使用三个本地 tarball glob。Landlock packed-install verification 检查具体依赖版本、launcher 权限、字节一致性和安装后 launcher 行为。
