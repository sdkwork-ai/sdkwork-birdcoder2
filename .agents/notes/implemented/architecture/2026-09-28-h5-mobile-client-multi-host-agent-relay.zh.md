# Agent Note: 将移动端 H5 客户端中继到多个自建 agent 运行时

Status: implemented

[English](2026-09-28-h5-mobile-client-multi-host-agent-relay.md) | 中文

## Problem

`apps/sdkwork-birdcoder2-pc` 把 harness 跑在进程内：渲染器与之对话的运行时就在它身旁。手机做不到这一点。手机没有容纳 harness 的空间，没有可供 agent 运行的文件系统，也无法在退到后台后维持长连接。因此 H5 根不能是"更小的 PC"——它需要另一种执行模型；而 `apps/sdkwork-birdcoder2-h5` 此前只是一副骨架，其 README 还写着渲染器与能力包尚未实现。

需求是：一个 owner 拥有**多个**宿主——Windows、Linux、macOS、Docker 以及云端 `sdkwork-sandbox` 实例，每个宿主跑一个 `sdkwork-birdcoder2`，全部从同一台手机可达。这使得移动端成为一条中继的一端，而中继的另一端是这台手机此前可能从未通信过的机器；并且它必须在不改造 PC 应用及其插件的前提下工作。

## Decision

**后端是共享同一个领域服务的两个 API 面。** `crates/sdkwork-routes-birdcoder2-app-api` 是 owner 的移动面（宿主、配对码、会话、回合、事件日志）；`crates/sdkwork-routes-birdcoder2-internal-api` 是宿主运行时面（附着、租约、心跳、领取回合、上报事件）。两者都以共享 `Arc` 持有 `crates/sdkwork-birdcoder2-host-runtime-service`。这一"共享"正是要害：owner 在 app 面铸造的配对码必须能在 internal 面被兑换，因此它们不能是两个各有存储的服务。`crates/sdkwork-api-birdcoder2-assembly` 负责装配。

**线路模型是中继，不是代理。** 附着流程为：配对码 → 租约 → 以租约时长的三分之一作为心跳间隔、钳制在 5–600 秒（`service.rs` 中的 `heartbeat_interval_seconds`）→ 宿主领取被提交的回合，并以单调递增的 `sequence` 追加事件。宿主状态在**每次读取时由租约投影得出**（`pending` / `online` / `offline` / `disabled`），因此不存在一份会与之漂移的独立健康记录。

**客户端按水位（watermark）跟随日志。** 手机只重读尚未应用的部分（借助 `afterSequence`），并把该水位持久化在宿主安全存储中（`@sdkwork/birdcoder2-h5-core` 的 `session` 面）。因此退到后台或断连是"续读"该会话，而不是重放它。实时文本由 `assistant-delta` 事件拼装，并在终态事件到达后被持久回合记录取代。单次运行以 150 轮、每轮 1.2 秒为上限——即三分钟——使已不再上报的宿主无法让手机一直不休眠。

**能力包只看见端口，绝不看见传输。** `BirdCoder2Ports` 是 `@sdkwork/birdcoder2-h5-hosts` 与 `@sdkwork/birdcoder2-h5-agent-chat` 唯一可导入的类型面；构造生成 SDK 客户端只发生一次，位于组合根。`check-frontend-composition` 强制这条规则，且已用变异验证证明它确实覆盖新包。shell 拥有页签栏与"组件键→屏幕"绑定，因此一个贡献了路由的能力会自动出现在导航中，无需编辑 shell；而路由指向未注册的组件键时会抛错，而不是渲染空白屏。

## Alternatives considered

**让手机直连每个宿主。** 已否决。每个宿主都需要一个手机可达的入站端点，owner 的凭据体系无处安放，而"机群"模型——一个列表、一次选择、一次撤回——将不得不在客户端重新发明。这也会把运行时关切塞进移动端产物。

**每个面各自一个后端。** 已否决。app 面铸造的配对码必须能被 internal 面兑换；拆成两个服务要么共享一个数据库（一种比显式 `Arc` 更糟的隐式耦合），要么在两者之间再定义一套交接协议。

**把 agent 自身协议直接代理给手机，而不维护日志。** 已否决。手机频繁退到后台、按设计就会断连，因此客户端需要一份有序、可按水位重新进入的可续读日志。实时流会丢掉这个回合。

**让 H5 根内嵌 harness 运行时。** 已由前提否决：这正是手机做不到的事。

## Consequences

- 移动端不持有任何运行时状态；断连的代价是从水位重放，而不是丢失回合。
- 宿主存活状态是推导出来的，因此租约过期即把宿主降级为 `offline`，无需清扫任务。
- 路由 crate 必须在根 `Cargo.toml` 的 `[workspace] members` 数组中显式列出：API assembly 物化器逐字读取该数组而不展开 glob，因此 `crates/*` 这样的 glob 会让每个路由 crate 从 `assembly-manifest.json` 中消失。
- PC 应用与 `packages/*` 客户端插件未被改动——因为 API 是中继，它们的表面无须任何变更。
- `tsconfig.base.json` 需要补一条 `@sdkwork/utils/*`。`sdkwork-sdk-common` 以子路径 `@sdkwork/utils/id` 导入，而裸行只匹配精确说明符，致使任何基于 Vite 的工具都无法加载生成的 app SDK。`tsc` 此前掩盖了这一点，因为它会从 sdk-common 自身的配置解析该说明符。

## Testing

`pnpm --dir apps/sdkwork-birdcoder2-h5 test` 运行 11 个文件、63 个用例。`vitest.config.ts` 的存在是因为 vitest 否则会回退到 `vite.config.ts`——那是一个从 `mode` 推导输出目录的构建配置，缺少它就会抛错，致使该包的 `test` 脚本从未通过；该配置还从 `tsconfig.base.json` 推导 `@sdkwork/*` 别名，因为 vitest 本身不支持 tsconfig `paths`，而 `paths` 的一行会直接解析到文件、绕过包 `exports`。

shell 的路由接线用例经过变异验证：把某个贡献的 `component` 键改成未注册的名字，会让两条断言失败并同时点名路由标识与那个错误键；改回后套件复绿。

`cargo check --workspace --all-targets` 对全部四个 crate 干净通过。`check-frontend-composition`、`check-composition-resolver`、`check-permission-composition`、`check-route-path-collisions`、`check-api-assembly-integration-closure`、`check-rust-backend-composition`、`check-apps-directory-index`、`check-app-manifest-standard` 与 `check-sdk-standard`（以 `--workspace` 限定范围）全部通过。`verify-repo` 在本轮新建或修改的任何文件中均无违规；它仅剩的发现是位于被 gitignore 的构建树（`apps/desktop/.desktop-build`、`.workbuddy/tmp/dsh-home-verify`）内的嵌套 `pnpm-workspace.yaml`。
