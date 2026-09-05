# Session 历史世代迁移同一时间只运行一个

[English](2026-09-05-session-generation-migration-serialization.md) | 中文

桌面开发 shell 在启动后 15–60 秒内崩溃，退出码 3758096392（`0xE0000008`），即 Chromium 的致命内存耗尽异常，且可稳定复现、无任何 JS 层记录：异常由分配器抛出，因此 `uncaughtException` 处理器、WER 事件与 diag 退出行都不会执行。一旦 `~/.dsh/sessions` 中存在未迁移的历史（v0/v1）会话日志，`pnpm desktop:dev` 每次启动都会以同样方式崩溃。

## 根因

released-format 迁移（`dsh-session-persistence-jsonl`）在会话首次被打开时，为每个历史日志发布一个 v2 后继世代。一次迁移 pass 会物化整个日志——解压、逐行解析、每条迁移边一次所有权快照外加源快照与恢复快照、重新编码、校验——因此其瞬时内存是会话解压后尺寸的数倍。`persistence.open()` 内联执行该 pass，而调用方会并发打开会话：桌面 shell 在 UI 加载时为列表中的每个会话做水合，冷读阶梯（例如 `dsh-subagent` 的 `COLD_READ_CONCURRENCY = 4`）本身也刻意并发。并行迁移把单次 pass 的峰值乘以调用方并发度；本机约 100 个历史会话使桌面 shell 主进程的 commit 在四秒内从 0.7 GB 冲到 10.8 GB 后死亡。由于崩溃会打断清扫，下一次启动会重新迁移同一批积压——形成启动崩溃循环。

A/B/C 实验把触发点隔离到历史世代路径：相同代码与配置下，包含历史日志的 harness home 在 15 秒内崩溃；去掉 `sessions/` 后存活；只保留已迁移 v2 日志后同样存活。

## 修复

`JsonlSessionPersistence.ensureCurrentLog` 现在把历史世代迁移按存储实例串行化（FIFO promise 队列），并用 per-id promise 映射把同一会话的并发打开合并到唯一一次进行中的迁移上。current 世代打开保持其仅读头的快速路径，不入队。迁移是每会话一次的稀有事件，串行化把进程的迁移瞬时内存上界限定为单次 pass，且无可测的延迟代价；在拥有该成本的层（persistence）保护了所有现在与将来的批量调用方，而无需改动任何调用点。

新增回归测试并发打开四个句柄（两个历史 id，其中一个 id 重复打开），断言恢复的日志正确、每会话只发布一个 v2 后继、迁移不重复执行。端到端验证：桌面 shell 在此前 60 秒内必崩的同一 `~/.dsh` 上存活 180 秒，主进程 commit 峰值约 860 MB，历史积压随多次启动逐步排空。

## 上游说明

迁移机制随上游 deepseek-harness 0.1.3-alpha.1（released-format migration、v1→v2 chunk migration、v2 snapshot rollout）进入本仓库。该缺陷对单元测试不可见，因为每个迁移测试只打开一个会话；它需要"多个历史会话被并发打开"，而这正是一个装有真实历史数据的桌面安装每次启动都会发生的事。任何在带有历史日志的既有 home 上升级的部署均受影响。
