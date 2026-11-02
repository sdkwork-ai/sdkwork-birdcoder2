# Agent Note: 逐目标的桌面发布 lane

Status: implemented

[English](2026-11-02-desktop-release-per-target-lanes.md) | 中文

## Problem

带 tag 的桌面发布把六个目标打包成一个 matrix job。单个目标失败——Electron 下载抖动、runner 镜像变更——只会在五个绿色 matrix 子项中留下一个红色子项，而重新打包单个目标的唯一受支持方式就是重新执行整个 workflow，从而重复六次依赖安装和六次 workspace 构建。打包本身也因此按结构重复：每条 lane 都跑同一份与平台无关的 workspace 构建与打包，每次尝试还会重新下载 Electron 发行版和随包运行时负载。

## Decision

[`desktop-release.yml`](../../../../.github/workflows/desktop-release.yml) 拥有目标表，[`desktop-package-target.yml`](../../../../.github/workflows/desktop-package-target.yml) 拥有 lane 主体。每个目标都是一个独立 job——从 `package-win-x64` 到 `package-linux-arm64`——因此运行摘要和 Actions API 会指明是哪个目标失败，"re-run failed jobs" 只重试该目标，matrix 也无法悄悄扩大失败面。可复用 workflow 以输入接收 runner、artifact、打包脚本和构建目录，因此六行仍是唯一的覆盖定义，lane 主体只有一个归属。

`resolve` 解析版本并校验可选的 `targets` 输入——`all`，或六个目标名中以逗号分隔的子集——按发布顺序归一，拒绝未知、重复和空条目。部分选择会以警告标注这次运行：[`assemble-github-release.ts`](../../../../scripts/release/assemble-github-release.ts) 只接受完整的六目标资产集，因此部分运行用于重新打包和诊断，不用于发布。

每条 lane 都把 Electron 发行版以及随包运行时的 Node、pnpm 和 Python 负载缓存在 runner 的临时目录中——位于 checkout 之外，因此 Windows 的短构建根不变——并以 runner 操作系统与架构为主键、以版本作为回退键恢复该目录。两份负载半区都按版本寻址，且运行时安装会校验其包 store，因此过期的缓存条目最多只会造成一次 lane 本来就要做的下载。该缓存可写，因此只在这几条可信发布 lane 之间共享，符合 [`apps/desktop/packaging/README.zh.md`](../../../../apps/desktop/packaging/README.zh.md) 的要求。

各 lane 保持并发且自包含：每条 lane 仍在本地构建并打包与平台无关的 workspace，而不是下载一份准备好的产物树。原因见下文的测量数据和被否决的备选方案。

## Measurements

一次本机 `win-x64 --unsigned` 运行，16 核 Windows 主机，依赖缓存和包缓存均已预热，数据取自该次运行的 `result.json`：总计 413 秒。

| 阶段 | 秒 |
|---|---|
| workspace 构建（`build --profile local`） | 73 |
| 打包 dsh、vendor、host、plugins 与 native entry | 81 |
| 运行时准备（Electron 下载、primary runtime） | 42 |
| package set | 15 |
| 运行时安装、materialize 与 packaged smoke | 98 |
| electron-builder | 111 |
| packaged runtime smoke | 35 |

workspace 构建之后的阶段合计为 413 秒，是因为 Windows 上打包 lane 与运行时准备并发执行；仅把这些行相加会高估，高出的正是这段重叠。workspace 构建与打包阶段是 lane 中与平台无关的那部分。这只是单台主机上的一个样本，不是 CI 预算；它给出了跨目标共享这部分工作所能减少的上界，而本决策仍将其保留在每条 lane 中。

## Alternatives considered

**保留 matrix，依赖 UI 的单子项重跑。** UI 可以重试单个 matrix 子项，但 matrix 无法以命名子集的方式 dispatch，其 job 名称也不带调用方或 API 可以依据的目标。显式 job 把同样的六行表留在同一个文件里，同时让"重新打包 `win-arm64`"变成一次 dispatch 参数。

**只生产一份与平台无关的构建，让每条 lane 下载。** 这样可以减少五次构建，但各 lane 现在是并发执行的：共享 job 成为六条 lane 之前的串行前置，其自身时长会落到由最慢 lane 决定的临界路径上，而且一次共享失败会阻塞所有目标。它节省的是 runner 分钟，不是墙钟时间；而缓存下载已经消除了真正消耗墙钟的那部分重复。

**跨 commit 缓存已构建的 workspace，使每条 lane 的构建变为增量。** 从另一个 commit 恢复的产物树会留下已删除或已改名源码的输出文件，`pnpm pack` 随后会把这些文件当作属于本次发布的内容打包。lane 自身的构建才是产物树与本 checkout 匹配的证明。

**把 lane 主体留在 `desktop-release.yml` 中并按目标复制。** 一个 130 行 job 的六份副本会在第一次修改 runner、环境变量或 preflight 步骤时漂移；调用方目标表加一份可复用主体的做法，把目标数据和目标步骤分开。

## Consequences

失败的目标是一个名称稳定的 job，重试只重复该目标；其他五个目标已上传的产物仍留在该次运行中。单目标的一键重新打包是一次带 `targets: <name>` 的 `workflow_dispatch`，这种运行无法发布；`resolve` 以警告说明这一点，而不是等到汇总 job 才发现。

lane 主体搬进可复用 workflow，因此调用方 workflow 就是目标表；[`scripts/desktop-release-workflow.spec.ts`](../../../../scripts/desktop-release-workflow.spec.ts) 把六行的 runner、构建根、平台设置文件、打包脚本和产物名固定到 [`desktop-build-paths.mjs`](../../../../apps/desktop/scripts/desktop-build-paths.mjs) 与发布汇总器的产物清单上。新增一个目标意味着 `resolve` 词表里的一行、一个 job，以及汇总器中的一条记录——缺少任何一处，该 spec 都会失败。

每条 lane 仍重复与平台无关的 workspace 构建和打包。上文测量就是修改这一点的预算，而下载缓存覆盖了每次尝试都会消耗墙钟的那部分重复。
