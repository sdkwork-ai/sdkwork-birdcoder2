# Agent Note: SDKWork BirdCoder2 部署标准采纳

- Date: 2026-08-20
- Kind: feature

Status: implemented

[English](2026-08-20-sdkwork-birdcoder2-deployment-standard.md) | 中文

## 问题

`sdkwork-birdcoder2`（DeepSeek Harness + SDKWork 插件）缺少 v2 部署契约：没有 `deployments/deploy.yaml`、`specs/topology.spec.json`、`etc/topology/*.env`、`agent.workflow.json` 或 `deployments/kubernetes/`。校验器 `check-deploy-standard`、`check-topology-deployment-profiles` 以及严格的 manifest 发布对齐全部失败。

## 决策

镜像 `sdkwork-birdcoder` 的部署布局，并带 harness 专属差异：

- `appId` 跟随仓库目录（`sdkwork-birdcoder2`）；`applicationCode` 为 `birdcoder2`。
- 已注册的云主机使用 `harness*.sdkwork.com` 角色行；平台网关主机保留在共享的 `api*.sdkwork.com` 注册表中。
- 应用入口是 `dsh web`（开发环境 loopback `7780`，生产环境容器 `4080`），而非 `10240` 上的 Rust 独立网关。
- `deploy.yaml` 暴露 `web: pc`，因为 Web 壳层位于 `apps/web`，而不是 `apps/sdkwork-birdcoder2-pc/`（仅为校验器警告）。
- 桌面 Electron 仍是主要独立交付物；云 profile 通过适配端口 `4080` 的复制 Helm chart 发布容器镜像。

## 验证

```bash
node ../sdkwork-specs/tools/check-topology-deployment-profiles.mjs --root .
node ../sdkwork-specs/tools/check-deploy-standard.mjs
node ../sdkwork-specs/tools/check-app-manifest-deployment-standard.mjs --root . --strict-release-targets
```

全部通过；部署校验对非规范的 `apps/web` 布局发出预期警告。

## 影响

仓库现在提供 `deployments/deploy.yaml`、`specs/topology.spec.json`、十个 profile 投影、`agent.workflow.json` 与 `deployments/kubernetes/`，且三个校验器在默认检查通道中通过。部署描述符是构建与发布通道读取的权威，因此 profile 变更只需改一处，而不是各 surface 各存一份。

## 备选方案

**保留各 surface 各自的部署描述符。** 否决原因：标准校验器读的是仓库根描述符，而重复的 surface 副本正是 v2 契约要消除的漂移。

**在后续版本再采纳标准。** 否决原因：严格的 manifest 发布对齐当时已经失败，不采纳就无法发布。
