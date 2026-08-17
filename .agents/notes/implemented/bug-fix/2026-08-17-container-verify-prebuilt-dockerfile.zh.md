# Agent Note：容器校验必须匹配预构建镜像阶段

Status: implemented

[English](2026-08-17-container-verify-prebuilt-dockerfile.md) | 中文

## 问题

`scripts/release/verify-container.ts` 仍要求 `Dockerfile` 内出现 `pnpm run build`。镜像阶段现已通过 `prebuilt` Buildx 上下文复制 runner 上已构建的树，并只在镜像内打包 release tarball。带 `birdcoder-v*` 标签的发布因此在「Verify deployment and release definitions」处失败，桌面与容器产物无法继续组装。

## 决策

让静态校验与已交付的 Dockerfile 及发布工作流一致：

- 要求先 `COPY --from=sdkwork-ecosystem`，再 `COPY --from=prebuilt`，然后保持既有的 pack / `npm install` / smoke 顺序。
- 禁止 Dockerfile 内出现 `pnpm run build` 与 `pnpm install`，避免镜像静默退回为在镜像内构建 workspace。
- 要求发布工作流在 runner 上构建，并把 `prebuilt` 与 `sdkwork-ecosystem` 两个命名上下文传入 Buildx。

同步更新 sibling-checkout Agent Note 中「sibling 复制后在镜像内 `pnpm install`」的过时事实。

## 备选方案

| 已否决 | 一句话原因 |
|---|---|
| 把 `pnpm run build` 写回 Dockerfile | 会重新引入预构建上下文要消除的 sibling 安装失败 |
| 在 bundle job 中跳过 `verify:container` | 去掉能抓住该契约漂移的门禁 |

## 影响

- 当前 Dockerfile 与 `container-release.yml` 下 `pnpm run verify:container` 通过。
- 未来若 Dockerfile 再次在镜像内重建 workspace，发布前门禁会失败。
