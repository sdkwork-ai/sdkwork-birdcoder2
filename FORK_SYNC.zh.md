# Fork 与上游同步

[English](FORK_SYNC.md) | 中文

本仓库是
[`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness)
（即上游项目本身）的**派生 fork**。它是一个独立项目，后续会增加大量自己的
新功能，同时可以随时拉取上游代码更新。

fork 关系通过经典的双远程 git 配置维持，而不依赖 GitHub 原生的 fork 功能：
`upstream` 指向原始项目用于同步，`origin` 是本项目自己的仓库。同步能力完全
一致，并且拥有完全的个性化改造自由度；防止 fork 改动与上游冲突的命名契约与
品牌契约见 [AGENTS.md](AGENTS.md)。

## 远程（remote）布局

| 远程 | 地址 | 角色 |
| --- | --- | --- |
| `upstream` | `https://github.com/deepseek-ai/deepseek-harness.git` | 同步源（只读） |
| `origin` | `git@github.com:sdkwork-ai/sdkwork-birdcoder2.git` | 本项目自己的仓库 |

查看：`git remote -v`

## 分支

- `main` 是本项目的开发主线，初始内容来自上游 `master`，
  所有本地/个性化修改都提交在这里。
- 上游的长期分支是 `master`，以 `upstream/master` 的形式本地镜像，执行
  `git fetch upstream` 即可刷新；上游自己的短期分支（release 与 dependabot
  分支）也会一并拉取，但不进入本项目的历史。

## 从上游同步代码

### 推荐方式（一条命令）

```sh
scripts/sync-upstream.sh
```

脚本会拉取 `upstream`（全部分支与标签，并清理已删除的远程分支），
然后把 `upstream/master` 合并进当前分支。没有本地改动时是快进合并；
如果本地提交与上游改动了同一处代码，按常规解决冲突后提交合并即可。

当落后的提交量变大之后，工作区合并会变得不可行（数百个上游提交、上千个
文件会卡死或被中断）。此时应改走本仓库的 plumbing 流程——用
`git merge-tree --write-tree` 组装合并树、逐个冲突 hunk 裁决，再用
`git commit-tree -p <ours> -p <upstream>` 建提交——结果仍然是
**真实双亲合并提交**，绝不是 squash，上游历史与提交信息完整保留。

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
- 上游发布标签（`dsh-v<版本>`）会随同步拉取并镜像到 `origin`，
  保证版本可追溯。
- `upstream` 已经直接指向 `deepseek-ai/deepseek-harness` 本身，
  不需要再额外添加远程就能访问原始源码。
- 历史沿革：曾有一个 SDKWork 桌面发行版
  `sdkwork-ai/deepseek-harness-desktop` 位于本项目与上游之间。它已被
  **删除**；本仓库的所有远程与同步工具都已直接指向
  `deepseek-ai/deepseek-harness`。
