# Agent Note: SDKWork OpenClaw 桥 —— 两个 agent 运行时的双向互通

Status: proposed

[English](2026-09-12-sdkwork-openclaw-agent-bridge.md) | 中文

## 问题

OpenClaw 是一个本地优先的 Agent 执行网关：一个常驻 Node 进程，其 Gateway 拥有入口、鉴权、路由、会话与事件，绑定在回环地址（默认 `127.0.0.1:18789`），在 WebSocket 上传输 JSON 帧（先 `connect` 握手，之后是请求/响应/事件三类帧），同时另有一组 HTTP 表面。在这个进程内部，OpenClaw 拥有自己的 agent 运行时——系统提示词、模型供应商、75+ 工具目录、技能、记忆、压缩、子代理，以及 Docker 沙箱执行。它通过 channel 适配器与插件扩展点（工具、钩子、频道、模型、HTTP 路由、后台服务、聊天命令、终端命令）触达外部世界。

dsh fork 是它的镜像：一棵 Cordis 插件树，`core/agent-loop` 拥有 turn/step，`core/tools` 拥有工具注册表及其审批/沙箱流水线，`core/session` 拥有只追加的事件日志，而每一个对外传输面都是一个插件（`acp`、`sdk`、`webhook`、`mcp`）。

今天 fork 里唯一提到 OpenClaw 的地方并不是运行时关系。`packages/client/ui-sdkwork-apikey` 渲染一个快速导入界面，其文案指向 `~/.openclaw/openclaw.json`（`models.providers.<id>`、`agents.defaults.model.primary`），让运维者把 CloudRouter 的 key 写进 OpenClaw 的配置。那是**配置层面**的相邻关系：它让 OpenClaw 调用同一个模型端点，但两个 agent 的工作成果谁都到不了谁那里。dsh 会话无法把任务交给 OpenClaw 的 agent 并消费其结果；OpenClaw 的频道对话也无法把任务交给 dsh。两个运行时是两座恰好共用一个模型 key 的孤岛。

这个缺口值得补，是因为两者各有所长。dsh 有可重放、精确的会话日志，有工作区/会话模型，有审批与沙箱策略，有一副精挑细选的编码工具面。OpenClaw 有 50+ 聊天频道入口、长时间主动/后台执行、节点配对、自己的沙箱后端，以及成熟的多平台投递层。两者都不会吞并对方，也都不应该：它们是两个独立产品，有不同的发布节奏、不同的安全模型、不同的用户契约。缺的不是合并，而是一份**契约**。

难点在于，「agent 运行时」本身不是一条库边界。两个系统都想拥有同一批名词（`session`、`turn`、`message`、`tool call`、`approval`、`usage`），并且都把那些名词持久化成互不兼容的格式。任何试图统一词汇表、镜像日志、或让二者共享一个 loop 的设计，都会带来双写风险、归属不清的取消语义，以及任何一侧升级时永久的合并冲突。可行的设计必须让边界变得**薄、显式，并在必要处显式承认有损**——而且必须能扛住两侧各自独立升级。

## 提案

新增一个 fork 自有的 OpenClaw 桥，以一个小规模的包族承载，建立在一条规则之上：**两个运行时仍然是两个运行时，只有任务与结果跨越边界。**

具体来说：dsh 获得一个 `openclaw` 子代理 provider，使 dsh 的模型可以把任务委托给 OpenClaw 的 agent 并消费其结果；OpenClaw 则通过 dsh 已经发布的表面（ACP、webhook）来驱动 dsh，使 OpenClaw 的频道对话可以把任务委托进 dsh 会话。不共享日志，不共享 loop，不共享工具注册表，任一方向都不引入源码级依赖。

### 不变量

下面五条不变量就是这个设计本身。后续每一个决定都从它们推导；任何违反其中之一的新想法是被拒绝的，而不是被协商的。

1. **一个 turn 一个主人。** 一个 turn 恰好由一个运行时拥有。dsh 拥有父 turn 与子运行的*已发布句柄*；OpenClaw 拥有被委托 turn 内部的一切——它的模型选择、它的工具调用、它的沙箱、它自己的审批。桥自己不执行工具，也不调用模型。
2. **不镜像日志。** 任何一侧都不写对方的会话日志。远程子代理运行是一次性的、只产出终态结果（按契约 `SubagentRun.localAgent` 为 `undefined`）；dsh 不把 OpenClaw 的 turn 结构投影进自己的权威日志，OpenClaw 亦然。可观测性是一条独立且**明确非权威**的通道。
3. **只共享身份。** 共享的可变状态只有一份会话身份映射（外加运行记录）。上下文、历史、工具目录、凭据、策略都不共享；各侧各自应用自己的。
4. **非对称的接缝，且取自既有的东西。** 出站使用 dsh 自己「运行另一个 agent」的扩展点——`SubagentProvider`。入站复用 `acp` 与 `webhook`。dsh 侧不发明新协议，主要路径上 OpenClaw 侧不需要任何插件。
5. **零跨仓源码依赖。** 唯一的耦合面是 OpenClaw 的 Gateway 线协议，由握手钉定与校验。fork 必须能在不碰 OpenClaw 的前提下升级，OpenClaw 也必须能升级到任何仍能协商出受支持协议版本的版本。

### 包拓扑

| 包 | 目录 | 职责 | 依赖 |
|---|---|---|---|
| `@deepseek-ai/dsh-sdkwork-openclaw-protocol` | `packages/host/sdkwork-openclaw-protocol/` | Gateway 线协议客户端：连接/握手、帧 schema、请求响应关联、事件分发、幂等键、心跳、重连退避、背压。一份规范化的桥 IR。**零 Cordis、零 dsh 语义。** | `ws`（或 Node 内置 `WebSocket`）、钉定的 OpenClaw schema 快照 |
| `@deepseek-ai/dsh-sdkwork-openclaw` | `packages/host/sdkwork-openclaw/` | 桥宿主服务 `ctx.sdkworkOpenclaw`：到 dsh 词汇表的防腐层映射、会话身份映射、网关生命周期、设置、凭据解析、遥测、健康。 | protocol + `cordis`、`settings`、`credentials`、`subprocess`、`telemetry` |
| `@deepseek-ai/dsh-sdkwork-openclaw-subagent` | `packages/subagent/sdkwork-openclaw-subagent/` | 出站适配器：名为 `openclaw` 的 `SubagentProvider`，以及它自己的 `cordis.patch.yml`。 | 桥服务 + `subagent` |
| `@deepseek-ai/dsh-sdkwork-openclaw-ingress`（P4，可选） | `packages/host/sdkwork-openclaw-ingress/` | 入站适配器，**仅当**复用的 ACP/webhook 路径被证明确实不够时才做（见下）。 | 桥服务 + `webServer` / `webhook` |

如果首版觉得包族太重，有一个单包降级形态：`packages/host/sdkwork-openclaw/` 下用 `src/protocol/`、`src/translate/`、`src/subagent/` 三个子目录加一个 patch 文件。把协议层从第一天就拆出来只有一个具体理由——它是 OpenClaw 线协议演进时*唯一*必须改的东西，而一个只带一条可审计的、与 dsh 无关的外部依赖的包，能让这次改动变得廉价且可在隔离环境里测试。它也会自然成为第二个消费者（入站适配器需要同一套握手）的依赖。

命名遵循 fork 契约：每个新增包都带 `sdkwork` 标记（`dsh-sdkwork-openclaw*`），宿主包放在 `packages/host/sdkwork-*`。不新增任何 `bin` 入口，`verify-application-entrypoints` 因此保持满足；ACP 启动路径是已发布的 `dsh --profile acp`，而不是一个新可执行文件。

### 分层职责

桥分七层，每层只做一件事。这样拆是为了任何一层的改动都不会逼着另一层改。

- **L0 — 线协议。** 帧进帧出。拥有 `connect` 握手（鉴权 + 能力/权限对齐）、请求 id、响应关联、事件订阅与分发、副作用方法的幂等键、心跳、有上限退避的重连、背压。它不认识 agent、会话或 dsh。
- **L1 — 防腐层/翻译。** 桥 IR 与 dsh 词汇表之间的纯函数。每个映射都是全函数，每个有损映射都集中在一张表里被**点名**，而不是等运行时才发现。
- **L2 — 宿主服务。** `ctx.sdkworkOpenclaw`：`status()`、`health()`、会话身份映射、`submit()`、`abort()`、事件扇出，以及网关生命周期。这是两个身份唯一相遇的地方。
- **L3 — 出站适配器。** 那个 `SubagentProvider`。把 `ResolvedSubagentStartRequest` 翻译成一次网关会话 turn，把 OpenClaw 的终态结果翻译成 `SubagentResult`。
- **L4 — 入站适配器。** 复用既有接缝（见下）。刻意做成最薄的一层。
- **L5 — 可观测性。** 遥测事件、结构化日志、健康表面、运行记录。对任何一方的历史都不具权威性。
- **L6 — 策略。** 信任边界、令牌处理、环境变量清洗、单次委托的作用域，以及把结果当不可信内容处理。

### 出站：dsh 的模型委托给 OpenClaw 的 agent

端到端流程：

```
dsh model tool call (toolName: openclaw_delegate)
  -> ctx.tools pipeline: tools/pre-execute (allow | deny | ask)
     approval/sandbox policy applies here, unchanged — the bridge adds no path around it
  -> subagent service: validate declared capabilities, resolve the durable child descriptor
  -> SubagentProvider('openclaw').start(request)
       open/reuse the mapped OpenClaw session for this run
       send the prompt as one turn; apply the per-run tool/model policy if negotiated
       stream events internally for progress + cancellation
     -> SubagentRun { id, localAgent: undefined, result, dispose }
  -> await run.result  ->  SubagentResult { output, structured?, diagnostic?, stopReason }
  -> tool result (isError when stopReason !== 'completed')
```

（代码块按双语一致性契约与英文侧逐字节相同；上面的线性描述读作：模型发起工具调用 → 走 dsh 既有的 `ctx.tools` 审批/沙箱流水线 → subagent 服务校验能力并解析子描述符 → provider 在映射到的 OpenClaw 会话上开一次 turn → 拿到已发布句柄 → 等终态结果 → 作为工具结果回给模型，非 `completed` 即 `isError`。）

接线是一条 patch 行，不是代码。它精确对应既有的 `tool-subagent` / `tool-subagent-fork` 那一对：

```yaml
    - id: subagent-openclaw
      name: '@deepseek-ai/dsh-sdkwork-openclaw-subagent'
      config:
        providerName: openclaw

    - id: tool-subagent-openclaw
      name: '@deepseek-ai/dsh-tool-subagent'
      config:
        provider: openclaw
        toolName: openclaw_delegate
        maxDepth: provider-managed
        backgroundMode: one-shot
```

这里的 `maxDepth: provider-managed` 不是随手写的便利选项，而是文档为「递归预算属于子运行时自己的进程外 provider」规定的形态。OpenClaw 自己的子代理编排拥有它的递归深度。

**能力协商是最锋利的一处。** `SubagentProvider.capabilities` 是挂在挂载点的静态声明，而 OpenClaw 的真实能力集是版本相关且动态的。因此设计是：挂载时探测，用探测结果推导声明，并在该次挂载的生命周期内冻结它。

| `SubagentCapabilities` 字段 | 声明值 | 桥如何兑现 |
|---|---|---|
| `agentOptions` | P3 为 `false` | 单次运行的 provider/model 覆盖不在协商底线内；OpenClaw 的每 agent 模型属于配置，不是单次运行参数。只有线协议真的暴露了才提升。 |
| `outputSchema` | `true` | 桥追加一段受 schema 指引的指令，对返回值按请求的对象 schema 严格校验，不匹配则结算 `stopReason: 'error'`——这正是该接缝为「无法满足捕获的 provider」规定的契约。 |
| `depthLimit` | `false` | 委托深度属于 OpenClaw 自己的编排，所以工具行必须写 `provider-managed`。声明 `false` 会让一个数字型 `maxDepth` 在挂载时大声失败，而不是默默说谎。 |
| `toolFilter` | 仅当协商到的会话配置暴露了按会话的工具策略时为 `true` | 映射到 OpenClaw 自己的「prompt 之前先过策略」可见工具过滤。绝不用提示词文本模拟。 |
| `persona` | P3 为 `false`；确认会话指令路径后为 `true` | 作为会话级指令传递，不是拼进用户 prompt。 |

如果一次重连协商出的能力向量比 provider 挂载时**更窄**，provider 会把自己标记为降级，并带着可操作的诊断信息**拒绝新启动**，而不是接受一个它兑现不了的请求。静默谎报能力是本设计明确拒绝的唯一失败模式。

### 入站：OpenClaw 的对话委托给 dsh

考虑过四条路径；建议先发布前两条，其余作为可选。

| 路径 | 形态 | 成本 | 结论 |
|---|---|---|---|
| **ACP** | OpenClaw 的 ACP agents 路径启动外部 harness；把它指向 `dsh --profile acp`（dsh 已发布的 stdio ACP 服务端） | dsh：零代码。OpenClaw：仅配置。 | **首选** —— 交互式、逐 turn、标准协议；且 `packages/subagent/subagent-acp` 已经证明 dsh 两侧都说正确的 ACP。 |
| **webhook** | OpenClaw（或其频道插件）POST 一个签名投递；`ctx.webhookRuntime` 鉴权后创建 Workspace Session | dsh：一条规则加一个 secret。OpenClaw：一个 HTTP action。 | **推送场景首选** —— 异步、即发即忘、一任务一会话，复用既有的规则/会话请求契约。 |
| **SDK JSON-RPC** | OpenClaw 讲 dsh 的 `dsh --profile sdk` 协议 | 低，但该协议与 dsh 自家 SDK 客户端版本绑定 | **备选** —— 可行，但那是 dsh 的私有客户端契约，不是第三方交换格式。 |
| **fork 入站插件** | 在既有 `ctx.webServer` 上开一个带鉴权的 HTTP/WS 端点，并带流式进度下行 | dsh：一个新包加一条新线。OpenClaw：一个插件。 | **P4，仅按需** —— 只有当「流式、双向的入站控制通道」成为真实需求时才值得，因为 ACP 已经在交互式场景覆盖了流式。 |

选择 ACP 加 webhook 意味着入站方向在最简形态下**完全不需要 fork 代码**：一份有文档的启动配方加一条 webhook 规则。这是「两个组件独立演进」能有的最强表达。

### 会话身份：唯一被共享的名词

会话身份映射是互通的核心，也是桥拥有的唯一可变状态。它持久化在 Harness 主目录下，由 L2 单写者拥有，任一侧自己的会话存储都绝不写它。

| 字段 | 含义 |
|---|---|
| `bridgeRunId` | 桥铸造、每次委托唯一；运行记录的主键。 |
| `direction` | `outbound`（dsh 委托）或 `inbound`（OpenClaw 委托）。 |
| `openclawSessionKey` | OpenClaw 的会话 key，含其 频道/账号/聊天/线程/agent 路由元组。 |
| `openclawAgentId` | 服务此映射的 OpenClaw agent。 |
| `dshSessionId` | dsh 会话：发起委托的父会话，或为入站任务创建的工作区会话。 |
| `parentDshSessionId` | 出站运行时设置；顶层会话则缺省。 |
| `idempotencyKey` | 保护重连后的重放启动不产生重复副作用。 |
| `state`、`lastSeq`、`lastActivityAt` | 存活与可恢复性，用于对账与泄漏上报。 |

两条规则让它保持诚实。第一，**`sessionMode`** 是显式配置——`per-run`（默认：每次委托开一个全新 OpenClaw 会话，避免跨任务上下文串味）、`shared`（每个 dsh agent 一条长活 OpenClaw 会话）、`explicit-key`（运维钉定）。第二，条目在失败时*永不*删除；一次未能确认子运行已结算的结束会留下 `orphaned` 记录，健康表面负责上报它。猜测远端会话已经结束，恰恰是本设计要避免的那种静默分歧。

### 映射表

翻译是跨运行时设计最容易腐烂的地方，所以每一条映射都被枚举、都是全函数、都有测试。

**Prompt 与内容。** dsh `ContentBlock[]` → OpenClaw prompt 载荷。文本直通。图片与其他二进制块只有在协商到的线协议支持该内容类型时才映射；否则映射是*有损且大声的*——桥插入显式的 `[unsupported content block: <type>]` 标记而不是丢弃它，这样子方可以要求重发，而不是对着一个残缺问题给出静默的答案。

**停止原因。** OpenClaw 的终态结果 → `SubagentStopReason`。`completed` → `completed`；运维/模型取消 → `aborted`；模型或传输失败 → `error`；长度/令牌上限 → `max-tokens`；显式拒绝 → `refusal`。桥无法分类的原因映射为 `error`，并在诊断里点名那个未映射的值——绝不映射为 `completed`。

**失败细节。** `SubagentResult.diagnostic` 由 provider 撰写、不含秘密、上限 4096 UTF-8 字节：它携带桥自己的错误 slug、协商到的协议版本、运行 id 与远端错误类别——绝不含原始协议载荷、文件内容、prompt 文本或凭据材料。

**用量与遥测。** 远端用量上报在桥自己的遥测通道上，归属到该运行与父会话。它被刻意*不*注入 dsh 的权威用量记账，因为用本地算术重新测量远端 provider 的 token 会产出看起来精确、实际并不精确的数字。

**错误。** 接缝无法表达为停止原因的传输故障（握手失败、不支持的协议版本、启动时网关不可达）会 reject `start()`；发布之后的一切都经由该运行结算为 `stopReason: 'error'`。运行绝不挂起：网关不可达时 `start()` 快速 reject 并给出可操作信息。

### 网关生命周期

三种模式，默认 `attach`，因为 Gateway 通常是运维者自己的进程（systemd、launchd、容器，或桌面 carrier）：

- **`attach`** —— 连接一个已在运行的 Gateway；有上限退避重试；绝不启动或停止它。
- **`supervise`** —— 通过 `ctx.subprocess` 配 `scrubbedParentEnv()` 启动它，使任何 `DSH_*` 值或模型 key 都不泄漏进子进程；就绪探测通过后才宣告健康；有上限退避重启；dispose 时树杀（`packages/host/sdkwork-app-build` 已验证过的形态）。
- **`remote`** —— 对非回环端点的显式 opt-in，走 TLS。

生命周期迁移作为服务事件发布，使 UI、遥测与委托工具都能如实说出「网关不可用」，而不是抛一个超时。

### 安全与信任边界

- **默认回环。** 非回环端点需要显式 opt-in 开关；桥拒绝把远端 Gateway 当作与本地等价。
- **令牌处理。** 网关凭据是一条*凭据引用*，在连接时经 `ctx.credentials` 解析——绝不明文进配置、进日志、进诊断。
- **环境洁净。** 每次受监督的启动都过 `scrubbedParentEnv()`：没有模型 key、没有 `DSH_*`、没有供应商令牌进入 OpenClaw 进程。
- **把运维信任边界说清楚。** 已配对的 Gateway 位于运维者的信任边界之内，这与 OpenClaw 自己架构文档的说法一致。桥不假装沙箱化远侧。
- **入站权限是显式且最小的。** 来自 OpenClaw 的任务**不**继承交互用户的权限。它带着一个具名主体进入，经既有的作用域工具机制做限制，并且始终走 dsh 正常的审批流水线。这是桥唯一可能悄悄变成提权路径的地方，所以它是一条一等设计规则，而非加固备注。
- **结果是不可信内容。** OpenClaw 的输出是数据，进入 dsh prompt 时裹上来源标注；绝不自动执行。

### 失败、取消与重连

`request.signal` 与 `run.dispose()` 是规范取消通道，两者都映射为对 OpenClaw 会话的一次 abort。如果阶段超时内无法确认 abort，该运行结算为 `aborted`，并且会话身份条目被标记待运维复查——泄漏被上报，而不是被藏起来。重连按会话 key 恢复；被重放的副作用调用由记录下来的幂等键保护。超时按阶段设置（连接、握手、启动、turn）且可配；每个阶段失败都产出各自具名的诊断。

### 可观测性

经既有 capability 接缝上报遥测，结构化日志以运行 id 作为关联字段，服务上暴露健康表面（`gateway`、`version`、`negotiatedCapabilities`、`pendingRuns`、`orphanedMappings`），以及一个可选的、明确标注为派生的只读会话视图供 UI 使用。桥绝不成为任何人历史的第二真相源。

### 测试策略

CI 不依赖装有 OpenClaw。L0 用进程内假 Gateway 测试，回放录制的帧，覆盖握手拒绝、能力收窄、turn 中途断连、重复幂等键。L1 用金表加往返属性测试，并且每个有损映射都被*断言为有损*。L2 测生命周期、重连与对账。L3 复用与 `subagent-acp`、`subagent-dsh-sdk` 相同的子代理契约测试装置。按 `packages/AGENTS.md` 的要求，需要一个进程级 REAL-composition 测试。对真实 Gateway 的在线端到端测试放在显式 opt-in 的环境变量开关后面。

### P0 前置：先把线协议钉死

在写 L0 之前，有一项发现任务必须先做：对真实运行的 Gateway 做一次真实握手，导出实际的 method 目录与帧 schema，并把该快照检入协议包。本笔记中除已文档化的帧类别之外的每一个 method 名字，都**以该快照为准，属于待确认意图**——设计假定存在请求/响应/事件帧与一次能力握手，但不得假定名字。

### 交付分期

| 阶段 | 交付物 | 通过条件 |
|---|---|---|
| P0 | 线协议快照、决策冻结 | 真实握手已抓取并检入 |
| P1 | `sdkwork-openclaw-protocol` + 假 Gateway | 帧与握手测试全绿 |
| P2 | `sdkwork-openclaw` 服务、`attach` 模式、身份映射、健康、设置、凭据 | 生命周期与对账测试全绿 |
| P3 | `sdkwork-openclaw-subagent` provider + 两条 patch 行 | 子代理契约装置全绿；README 三道门禁全绿 |
| P4 | 入站：ACP 配方 + webhook 规则；仅在有实测必要时做 ingress 包 | 一个由 OpenClaw 发起的任务落进真实 dsh 会话 |
| P5 | 控制面工具（`openclaw_status`、`openclaw_sessions`、`openclaw_channels`）、遥测、UI 健康 | 每个工具都被标准流水线覆盖 |
| P6 | `supervise` 模式、`remote` 模式、可选的 MCP 侧车做工具级共享 | 可选路径的安全复核 |

### 本笔记刻意留给你拍板的事

1. **`sessionMode` 默认值。** 建议 `per-run`；`shared` 连续性更好、隔离更差。钉定它取决于目标用例。
2. **先做哪个方向。** 建议先出站（dsh 委托），因为复用最多且可隔离测试；入站只需配置，可以同期发布。
3. **工具级共享。** 设计刻意让两套工具目录分离。要共享就需要 MCP，以及一个今天并不存在的 dsh 侧 MCP 服务端——那是一个真实的子项目，除非工具级互通是明确目标，否则不在范围内。
4. **ingress 包到底需不需要**，由 P4 的实测决定，而不是由胃口决定。

## 考虑过的替代方案

- **把 OpenClaw 当作一个 LLM provider。** 层次错了。OpenClaw 是一个自己会调用模型的 agent 运行时；把它注册成适配器会把「委托一个任务」塌缩成「调用一个模型」，丢掉它的工具面与沙箱，并让 dsh 自己的 agent loop 去当 OpenClaw turn 的主人——第一天就违反不变量 1。
- **双向进程内嵌入。** 把 OpenClaw 运行时 import 进 fork，或写一个 import dsh 的 OpenClaw 插件。两者都会造出跨仓源码依赖与共享 loop，于是任一侧的每次升级都变成一次合并，两条发布节奏被焊死。拒绝：它摧毁了需求所要求的独立性。
- **整条桥走 MCP。** MCP 承载的是工具与上下文，不是 agent 生命周期：它无法表达「在你自己会话里跑这个任务，并告诉我为什么停下」。它是对另一个问题（P6 的工具共享）的正确答案，却是委托的错误地基。
- **用 `setFactory` 替换 `agent-loop`，让 OpenClaw *成为* dsh 的 loop。** 该工厂只容一个实现，这么做会让 OpenClaw 与 dsh 变成互斥而非互通，并且把 OpenClaw 的会话语义塞进 dsh 日志与审批策略期待属于自己的地方。
- **镜像两侧会话日志。** 跨两种独立版本化的持久格式双写，会产生任何对账都解不掉的分歧，而且它意味着双方都要懂对方的格式——这个耦合比它去掉的耦合昂贵得多。
- **在两个运行时之间自建一条双向 WebSocket。** 表面上是最「解耦」的选项，实际是最耦合的：它发明了第三条双方都必须版本化的协议，而不是骑在 OpenClaw 已有的 Gateway 协议与 dsh 已有的 ACP/webhook 接缝上。
- **一个大包。** 感觉更简单，但协议层会与 Cordis 纠缠，而 fork 的包门禁（README 三件套、依赖不变量、路径生成）本就奖励小而单一职责的包。如果实践中包族确实太重，降级用的单包布局已在上文给出。

## 验收标准

1. dsh 会话的模型可以调用 `openclaw_delegate`，把真实 OpenClaw agent 的结果作为工具结果收到，且该运行以正确的停止原因出现在桥的健康表面上。
2. 同一次委托在 Gateway 停止时快速失败：`start()` 以具名诊断 reject，`status()` 报 `gateway: unavailable`——不挂起、无静默重试循环。
3. 取消 dsh 工具调用会取消 OpenClaw 的 turn；无法确认的 abort 留下 `orphaned` 映射，而不是伪造一个完成。
4. OpenClaw 频道对话可以经 ACP 路径把任务交给 dsh 并拿到 dsh 的答案，且 dsh 的审批与沙箱策略原样施加于该任务。
5. 每一行映射表都有测试，包括有损的那些；每一个无法分类的远端值都结算为 `error` 并点名那个未映射的值。
6. 重连导致的能力收窄会拒绝新启动，而不是接受不支持的请求。
7. `verify-cordis-config`、`verify-package-dependencies`、`verify-tsconfig-paths`、README 三道门禁、`verify-application-entrypoints` 在挂载新包后全部通过；除非 import 了 `@sdkwork/*` 兄弟包，`analyze-sdkwork-closure.mjs` 不受影响。
8. 任何诊断、日志行或错误表面里都不出现秘密、prompt 文本、文件内容或原始协议载荷。

## 风险

- **线协议漂移。** OpenClaw 的 Gateway 协议在演进；其笔记明确要求客户端把生成的 schema 当作真相源。缓解：协议包是唯一会变的地方，握手携带版本，不支持的版本拒绝启动而不是降级运行。
- **能力过度声明。** 声明一个远侧兑现不了的能力，会产出静默降质的工作。缓解：探测推导的冻结声明、收窄时降级、未确认项默认 `false`。
- **入站权限泄漏。** 严重度最高的风险：来自 OpenClaw 的任务带着超出预期的 dsh 权限进入。缓解：具名主体、作用域限制、强制审批流水线，以及一条专门的测试。
- **身份映射分歧。** 崩溃或不可达的 Gateway 会留下远端会话状态未知的映射。缓解：单写者所有权、失败不删、`orphaned` 状态，以及会上报它的健康表面。
- **成本与延迟不透明。** 委托会追加第二份模型账单与第二份延迟预算；远端子运行可能很慢但并不算错。缓解：按阶段超时、用量遥测走桥自己的通道，并且不尝试把远端用量折进本地记账。
- **本设计明知放弃的东西。** 不把远端子运行做 token 级实时流进 dsh 会话日志；不共享历史；不统一工具目录；不统一成本账本。这些是不变量 1–3 刻意付出的代价，反转其中任何一条都是另一个设计，而不是本设计的改良。
