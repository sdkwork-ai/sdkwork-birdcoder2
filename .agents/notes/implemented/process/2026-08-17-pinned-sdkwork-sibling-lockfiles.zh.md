# Agent Note: 固定兄弟仓库提交并同步发布锁文件

Status: implemented

[English](2026-08-17-pinned-sdkwork-sibling-lockfiles.md) | 中文

## Problem

发布工作区通过 `pnpm-workspace.yaml` 直接使用私有 SDKWork 兄弟仓库的源代码，而 GitHub Actions 会单独获取这些仓库。若锁文件根据本地脏的兄弟仓库生成，锁文件可能记录工作流实际未检出的 manifest，导致所有打包任务被 `pnpm install --frozen-lockfile` 拒绝。

## Decision

兄弟仓库设置 action 以不可变提交检出每个仓库，根目录 `pnpm-lock.yaml` 按这些确切的兄弟仓库 manifest 维护。appbase 固定提交为 `7455ba839f2b7aed6fd7c437d1093628f08fa4d2`，appstore 固定提交为 `ba039cc25a9ea40ccfbf585980796438c218584c`，IAM 固定提交为 `6a8bec57af5429470bda976500b6247308cdbf74`。它们的前端包不声明 backend SDK，而它们的 backend 或 app SDK importer 使用与这些提交匹配的 workspace 依赖规格。

兄弟仓库更新时，action ref 与根锁文件在同一个根仓库变更中同步更新。本地未提交的兄弟仓库 manifest 不具有发布权威性，也不能决定根锁文件。appbase 仓库独立负责其源代码与锁文件变更；根仓库只记录不可变 ref 以及由此产生的根锁文件状态。

## Alternatives considered

**从兄弟仓库的默认分支解析。** 移动分支使检出内容与锁文件的关系依赖时间，因此后续工作流可能在没有根仓库变更的情况下使用不同 manifest。

**根据开发者本地兄弟工作树生成发布锁文件。** 本地工作树可能含有未提交的依赖编辑，而 CI 获取的提交中没有这些编辑；本决定消除了这一失败模式。

**用已发布的包版本替代兄弟仓库 workspace 链接。** 发布工作区直接消费兄弟仓库源代码，且本次发布不发布 npm 包；注册表版本会失去源代码同步，并增加一个不可用的发布步骤。

## Consequences

发布安装相对于兄弟仓库源代码是可复现的；固定提交不可用时会明确失败，而不会静默选择其他修订。兄弟仓库更新需要同步修改 action ref 与根锁文件。一次独立的 clean install 已确认修正后的 ref 能进入依赖解析且没有 outdated-lockfile 错误，但当前主机上的 registry 请求被本地网络环境销毁，因此未能完成包下载。

## Testing

已确认修正后的 appbase 提交解析为 `7455ba839f2b7aed6fd7c437d1093628f08fa4d2`，其 backend manifest 的两个 workspace 依赖都使用 `workspace:*`。独立的 `pnpm install --frozen-lockfile --ignore-scripts` 已通过 frozen-lockfile 校验并在 registry/network 错误处停止。
