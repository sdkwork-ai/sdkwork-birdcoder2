# Agent Note: BirdCoder 容器资产命名

Status: implemented

[English](2026-08-16-birdcoder-container-assets.md) | 中文

## 问题

容器发布资产仍沿用 harness family 前缀：`dsh-container-<version>.tar.gz`、`dsh-container-image-<version>-linux-<arch>.tar.gz`，以及部署包目录 `dsh-container-<version>/`。桌面安装包已经冠名 `BirdCoder-*`，因此 k8s 与 Docker 的下载名称是唯一与产品身份不符的发布资产。

## 决策

所有容器打包名称统一使用 `birdcoder-container` 前缀：部署归档及其 checksum、两个镜像归档及其 checksum、Actions artifact 名称、staging 与解压目录 `birdcoder-container-<version>/`，以及安装文档中的本地归档名 `birdcoder-container-local.tar`。[pack-container](../../../../scripts/release/pack-container.ts) 脚本、[Release 汇总器](../../../../scripts/release/assemble-github-release.ts)、[容器工作流](../../../../.github/workflows/container-release.yml)、容器校验门禁以及安装与部署指南同步更新。镜像仓库名 `localhost/deepseek-harness` 保持不变：它是 Compose 与 Kubernetes manifest 内部的镜像引用，不是发布资产名，且由仓库命名契约管理。

## 备选方案

**继续使用 `dsh-container` 前缀。** 发布资产会继续分裂为 BirdCoder 桌面安装包与 dsh 命名的容器文件，这正是 fork 品牌化在其他地方已经消除的不一致。

**同时把镜像仓库改名为 `localhost/birdcoder`。** 镜像引用是受仓库命名契约约束的部署身份，并与源码构建和 registry 重新打标说明共享；改名应作为独立决策，而非随发布资产命名一起进行。

## 后果

下一个 `birdcoder-v<version>` 发布将包含 `birdcoder-container-<version>.tar.gz` 及其 checksum，以及带 checksum 的 `birdcoder-container-image-<version>-linux-{amd64,arm64}.tar.gz`。旧的 `dsh-container-*` 资产仅在之前的 Release 上可读；新下载全部使用改名后的文件。
