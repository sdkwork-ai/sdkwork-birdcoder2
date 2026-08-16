# Fork 与上游同步

[English](FORK_SYNC.md) | 中文

本仓库是
[`sdkwork-ai/deepseek-harness-desktop`](https://github.com/sdkwork-ai/deepseek-harness-desktop)
（SDKWork 维护的 DeepSeek Harness 桌面发行版）的**派生 fork**。它是一个独立项目，
后续会增加大量自己的新功能，同时可以随时拉取上游代码更新。

由于 `sdkwork-birdcoder2` 与 `deepseek-harness-desktop` 同属一个 GitHub 账号，
无法建立 GitHub 原生的 "fork" 关系（GitHub 禁止 fork 到同一属主下）。
因此使用经典的双远程 git 配置来维持 fork 关系——同步能力完全一致，
并且拥有完全的个性化改造自由度。

## 远程（remote）布局

| 远程 | 地址 | 角色 |
| --- | --- | --- |
| `upstream` | `https://github.com/sdkwork-ai/deepseek-harness-desktop.git` | 同步源（只读） |
| `origin` | `git@github.com:sdkwork-ai/sdkwork-birdcoder2.git` | 本项目自己的仓库 |

查看：`git remote -v`

## 分支

- `main` 是本项目的开发主线，初始内容来自上游 `master`，
  所有本地/个性化修改都提交在这里。
- 上游分支以 `upstream/master`、`upstream/codex/container-wsl-validation`、
  `upstream/codex/unified-release-rc11` 的形式本地镜像，执行
  `git fetch upstream` 即可刷新。

## 从上游同步代码

### 推荐方式（一条命令）

```sh
scripts/sync-upstream.sh
```

脚本会拉取 `upstream`（全部分支与标签，并清理已删除的远程分支），
然后把 `upstream/master` 合并进当前分支。没有本地改动时是快进合并；
如果本地提交与上游改动了同一处代码，按常规解决冲突后提交合并即可。

### 手动方式

```sh
git fetch upstream --tags --prune
git merge upstream/master        # 在 main（或任意本地分支）上执行
```

同步后发布：

```sh
git push origin main
```

## 保留本地（个性化）修改

本项目是 harness 的新版本，允许且鼓励分叉演化：

1. 所有本地开发都在 `main`（或特性分支）上正常提交。
2. 需要上游最新修复时随时执行 `scripts/sync-upstream.sh`。
3. 只有当上游改动了你同样改过的代码时才会出现合并冲突，
   按普通 git 合并处理即可；`git log --merge` 和
   `git diff upstream/master` 有助于理解上游改了什么。
4. 不要改写已经推送到 `origin/main` 的历史（除非团队一致同意，
   且只能使用 `git push --force-with-lease`）。

## 说明

- 上游默认分支是 `master`；本 fork 的开发分支本地与 `origin` 都是 `main`。
- 上游标签（`dsh-v0.1.0-rc.*`、`v0.1.0-rc.*`）会随同步拉取并镜像到
  `origin`，保证版本可追溯。
- `deepseek-harness-desktop` 本身是 `deepseek-ai/deepseek-harness` 的 fork；
  如需追踪最原始的上游，可额外添加远程：
  `git remote add deepseek https://github.com/deepseek-ai/deepseek-harness.git`
