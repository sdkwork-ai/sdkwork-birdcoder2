# Agent Note: SDKWork BirdCoder2 部署标准采纳

- Date: 2026-08-20
- Kind: feature
- Status: implemented

[English](2026-08-20-sdkwork-birdcoder2-deployment-standard.md) | 中文

## 问题

`sdkwork-birdcoder2`（DeepSeek Harness + SDKWork 插件）缺少 v2 部署契约：没有 `deployments/deploy.yaml`、`specs/topology.spec.json`、`etc/topology/*.env`、`sdkwork.workflow.json` 或 `deployments/kubernetes/`。校验器 `check-deploy-standard`、`check-topology-deployment-profiles` 以及严格的 manifest 发布对齐全部失败。

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
