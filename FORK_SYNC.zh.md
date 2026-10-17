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
| `origin` | `https://github.com/sdkwork-ai/sdkwork-birdcoder2.git` | 本项目自己的仓库 |

查看：`git remote -v`

## 分支

- `main` 是本项目的开发主线，初始内容来自上游 `master`，
  所有本地/个性化修改都提交在这里。
- 上游的长期分支是 `master`，以 `upstream/master` 的形式本地镜像，执行
  `git fetch upstream` 即可刷新；上游自己的短期分支（release 与 dependabot
  分支）也会一并拉取，但不进入本项目的历史。

## 从上游同步代码

同步是**增量且可重复**的：一个**同步锚点**记录上一次已经合入的上游提交，
因此每一轮只处理上游此后新增的内容，不必重新推导起点、也不会把旧冲突再打一遍。

### 五个步骤

```sh
scripts/sync-upstream.sh status     # 锚点 / 上游 tip / origin 三方对照 + 刻意偏离清单
scripts/sync-upstream.sh prepare    # 工作区与推送检查、回滚点、fetch、范围报告
scripts/sync-upstream.sh merge      # 真实双亲 --no-ff 合并 + 冲突清点
#   ……逐个解决冲突后：git add <已解决的路径> ……
scripts/sync-upstream.sh verify     # 合并后的校验
scripts/sync-upstream.sh anchor     # 记录新的上游 tip，随合并一起提交
```

`prepare` 在工作区不干净、或本地提交尚未推到 `origin` 时拒绝继续；它会把
`upstream` 的推送地址钉成 `DISABLED`（该远程只读），打印锚点里记录的
刻意保留/刻意删除清单，把当前 HEAD 打成 `backup/pre-sync-<时间戳>` 标签
（并维护滚动的 `backup/pre-sync`），执行 `--tags --prune` 拉取（仓库使用 LFS 时
再补一次上游 `git lfs fetch`）并给出本轮范围。若锚点已等于拉到的 tip，它直接
报 `ALREADY CURRENT` 结束、**不产生任何提交**；fetch 时的上游 tip 就是本轮上限，
之后上游再推的新提交留给下一轮。范围过大时它会打印按目录的分布并要求裁决
（`SYNC_ALLOW_LARGE=1` 可整体合，或按目录分批合）。

`merge` 一律使用 `git merge --no-ff`，绝不用 squash、rebase 或 cherry-pick：
改写本地历史会让 merge-base 失效，下一次同步就会把上游每条提交都当成新提交再冲突一遍。
若锚点已不再是上游的祖先（上游强推/重排历史的特征），它会停下而不硬合。

### 同步锚点

`.sdkwork/upstream-sync-anchor.json` 记录上游地址与分支、已同步到的 SHA 与发布标签、
以及把它带进来的合并提交。它**随合并一起提交**——这正是下一轮能保持增量的原因。
每轮还会把该合并提交打成 `sync/upstream-<sha7>-<YYYYMMDD>` 标签，仅保存在本地，
因此不可能与 fork 自己的版本标签撞名。

同一个文件还承载两张清单，作用是让每一轮都不必把同一批文件重新纠结一遍：

| 清单 | 含义 |
| --- | --- |
| `keptByFork` | 上游已删除、本 fork 刻意保留。以 `/` 结尾的条目覆盖整棵子树。 |
| `deletedByFork` | 上游仍在提供、本 fork 刻意不提供。 |

`status` 与 `prepare` 会打印它们，`verify` 会断言它们仍然描述当前工作树，
`scripts/sync-upstream.sh lists` 则从 git 反推两份候选集合并报出「记录未覆盖」的路径
——新出现的偏离因此是被登记，而不是被重新发现。

### 冲突裁决

按文件性质定归属，不做整树覆盖：

| 情形 | 裁决 |
| --- | --- |
| 品牌资产、sdkwork 组件/插件/路由/vendor、fork 独有文件 | 保留本仓库版本 |
| 上游核心功能代码 | 采上游版本 |
| 两边都改过同一表面 | 两边行为都保留，以上游结构为基线 |
| 上游删除了本 fork 改过的文件 | 逐文件判断，并把结论写进报告 |
| 依赖清单 | 取并集：上游新增条目与本地条目都留下 |
| 锁文件 | 取上游，随后重装依赖 |
| 重命名 | 按语义合并，不留新旧两份重复文件 |

禁止 `git checkout --ours .` / `--theirs .` 整树覆盖，禁止 `-X ours` / `-X theirs`，
禁止用删文件消解冲突，禁止跳过 hook，禁止 force push，禁止 `git clean -fdx`。

### 校验

`verify` 是机械的，按顺序检查：

1. 上游 tip 已是 HEAD 的祖先，且缺失的上游提交数为 0；
2. 没有残留冲突标记、没有未解决的索引条目；
3. 相对回滚点消失的路径，上游也已不再提供（没有误删）；
4. **本 fork 从未改动过的文件，在合并结果里必须与上游逐字节一致**——这一项才抓得住「上游内容被静默吞掉」，逐文件看冲突清单永远看不出来；
5. 品牌表面、sdkwork 包与锚点里记录的保留/删除清单仍然成立。

它同时报告版本家族（`package.json` == 上游最新 tag == `CHANGELOG.md` 首个标题）。
只有全部通过，`anchor` 才会推进锚点。

### 手动方式

```sh
git fetch upstream --tags --prune
git merge --no-ff upstream/master        # 在 main（或任意本地分支）上执行
git push origin main
```

落后极多时，工作区合并可能卡死；这类同步可以用 `git merge-tree --write-tree`
组装结果、再用 `git commit-tree -p <ours> -p <upstream>` 建提交。结果仍然是
**真实双亲合并提交**，绝不是 squash，上游历史与提交信息完整保留。

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
