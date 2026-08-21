# Agent Note: SDKWork fork 上游同步流程

Status: implemented

[English](2026-08-21-upstream-sync-procedure.md) | 中文

## 问题

`main` 是 `deepseek-ai/deepseek-harness` 的 fork，在持续合并上游的同时承载 SDKWork 专属功能。一次覆盖 fork 功能、压平上游历史或方向错误的冲突解决，会同时毁掉开源血缘与产品功能。第一次完整同步（2026-08-21，上游 `528c682e06`）确立了下述可执行流程；本笔记记录它，使后续每次同步都遵循同样的步骤与冲突规则。

## 流程

1. **先检查点（checkpoint）未完成的工作。** 工作区未提交的暂存/未暂存改动（上一次 SDKWork 同步、重命名、文档等）必须保留：用 `--no-verify` 提交到 `wip/<主题>-<日期>` 分支（WIP 状态按定义过不了卫生门禁），再把 `main` 重置干净。绝不在脏树上合并——git 会拒绝或半合并。
2. **以真实历史 fetch 并合并。** `git fetch upstream && git merge upstream/master` 产生 merge commit，原样携带上游的提交与 message。绝不 squash、rebase 压平或把上游 cherry-pick 到 main：fork 的合并历史是保持后续 diff 小、开源血缘完整的关键。
3. **冲突解决 fork 优先。** 保持产品完整的规则：
   - 仅 SDKWork 的文件（上游无对应物）：整体保留本地版。
   - 仅上游的文件：整体取上游版。
   - 双方都改的文件：合并两种行为。纯版本号冲突的 `package.json` 取上游版本行（fork 不发布 `@deepseek-ai/dsh-*`，且上游版本行让下一次同步更小）。生成式目录/文档取上游版后重新生成。
   - 上游改了 fork 实现的接口（例如 `webServer.renderIndex`）：在 fork 代码里实现新接口，不要回退接口。
4. **把上游结构适配到 fork 的分支与产品。** 上游 `master` 命名的 CI 工件（`ci-master.yml`、`refs/heads/master`）改为 `main`。上游发布流程拆分（pack 与 publish 分离）适用，同时保留 fork 的 tag 与产品事实。上游新增的跑 `pnpm install` 的 CI job 需要补上 fork 必需的 `setup-sdkwork-siblings` 步骤。
5. **每次内容变更后重录双语配对。** 上游 verifier（`verify-translation-pairing`）比 fork 旧版更严；解决文档后运行 `pnpm run verify-translation-pairing --write --all`，并按它报告的规则修复错误 locale 链接。对合并前就已漂移的配对（fork 自身债务），保持 fork 一侧一致并明确记录剩余漂移。
6. **对照合并前基线验证。** typecheck 与全量测试相对 `main` 不得回退：在能解析 `../sdkwork-*` 兄弟仓库的干净 worktree 里跑同样的命令（`/tmp` 下的 worktree 会静默跳过兄弟源码，给出假通过）并对比失败集合。评判测试结果前先完整构建 `lib/` 产物（`pnpm run build:lib`）——上一会话的陈旧 bundle 会产生幻影失败。
7. **留意共享兄弟 checkout。** 任何 worktree 里的 `pnpm install` 都会把 `../sdkwork-*` 的 node_modules 重链到该 worktree 的 store。用完 worktree 后删除它并在主 checkout 重新 install，让兄弟包指回主仓库。

## 冲突决策表

| 表面 | 取哪边 | 原因 |
|---|---|---|
| 仅 SDKWork 的包/文件 | 本地 | 上游无对应物；取上游版等于删除该功能 |
| 仅上游的文件 | 上游 | fork 从未定制 |
| `package.json` 版本行 | 上游 | fork 不发布；上游行让下次同步更小 |
| 双方都改的代码 | 合并 | 保留 fork 行为，在表面不重叠处采纳上游行为 |
| 生成式文档/目录 | 上游 + 重新生成 | 生成文件必须匹配合并后的源码 |
| CI 分支名 | 本地（`main`） | fork 的默认分支 |
| 发布 tag/产品事实 | 本地 | `birdcoder-v*` tag、桌面应用、SDKWork relay |
| 上游改过的服务接口 | 在 fork 代码里实现新接口 | 回退接口等于 fork 上游契约 |

## 结果

2026-08-21 同步合并了 172 个上游提交、277 个冲突文件，把 fork 的 `sdkwork-` 命名契约写进 AGENTS.md，修复了两处真实接口缺口（desktop-carrier 的 `renderIndex`；测试的 boot 标记断言），并以零合并引入的 typecheck/测试回退落地。剩余失败（sdkwork 兄弟包 API 漂移、陈旧双语配对）是 fork 既有债务，由 WIP 分支继续处理。
