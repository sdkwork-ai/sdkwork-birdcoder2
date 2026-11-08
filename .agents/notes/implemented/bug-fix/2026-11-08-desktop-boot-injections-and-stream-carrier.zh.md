# Agent Note: 桌面外壳按当前启动行重载，其事件流走 fetch

Status: implemented

[English](2026-11-08-desktop-boot-injections-and-stream-carrier.md) | 中文

## Problem

两个仅桌面端出现的故障共有一个原因：文档归外壳所有，因此 `dsh web` 每次加载都能免费拿到的状态在这里不会自动保持最新。

外壳自行提供 `dsh-app://app/`，并在 Host 报告就绪时通过私有 IPC 取一次启动注入行。此后没有任何刷新。Host 运行期间客户端 bundle 与插件图持续变化：一次 HMR 重建会发布新的 bundle revision，插件安装、启用或禁用会重新组合图。变化之后重载页面会重放启动时的行，其中阻塞式 bootstrap 脚本指向 `plugins/??@deepseek-ai/dsh-client-modules/client.js&rev=<旧值>`。Host 的 bundle 路由是以当前 revision 为键的精确路由表，于是它回答 404，`__ModuleLoader__.create` 拿不到 bootstrap 注册，窗口停在“Loading plugins…”界面。在运行中的 online 开发应用里观察到：页面请求 `...&rev=3d2fe526c30f`，而 Host 当前图指向 `...&rev=1a16ee674e32`；同一探针通过 scaffold 的 served 组合得到 200，因为该 Host 每次请求都按实时状态渲染 index。

客户端 HMR 传输用浏览器 `EventSource` 打开 `plugins/events`。Chromium 无法从自定义 scheme 文档流式读取该路由：请求完成（状态 200）后连接失败（`net::ERR_FAILED`）。因此桌面页面从未收到初始图或 `rebuilt` 帧，既不能热替换重建的插件，也不能感知图变化，唯一恢复手段是重载——而重载又撞上上面的过期行。

丢失的 inject face 表现为崩溃而不是不可用条。注册的 `inject` 工厂抛错时（会话或服务在注册与渲染之间离开），`ui-renderer` 有意在缺少注入 props 的情况下挂载该条。composer 主体完全由这些 props 构建，于是 `InputBar` 调用了不存在的注入 hook，崩溃，其会话作用域子 slot 又把 `SlotAssemblyError` 抛穿会话树：一个服务丢失产生三条控制台报错。

## Decision

`boot-injections` 加入外壳到 Host 的控制请求，与 `update-tasks`、`quit-inspection` 并列。Host 以每次请求现算的 `collectIndexInjections(ctx.connection.browserPeer)` 应答，外壳在每次 `DESKTOP_IPC.boot` 时请求并替换缓存，再组合应答。启动 `ready` 载荷仍提供首批行与离线回退：控制请求失败或超时，页面使用最近一次行启动而不是失败。刷新刻意只在每次 boot 进行，不在图变化时推送——已运行的页面通过事件流得知重建，只有新文档需要新行。

HMR 浏览器半按文档所有者选择载体：优先外壳提供的传输（Worker Preview 隧道），http(s) 文档用原生 `EventSource`，其他 scheme 用 `fetch` 读取器。两条 fetch 路径共用一个重连循环：流关闭或失败后一秒重试，一次断连只记录一条错误，收到首帧即清除断连状态，使之后的失败再次被报告。桌面页面与其他应用路由走同一请求管线读取 `plugins/events` 字节。

`InputBar` 把依赖注入的主体放在守卫之后。注入的 hook 席位缺失时，公开条目渲染惰性 dock（`data-composer-unavailable`），绝不进入主体，因此主体的 hook 只在所需席位齐全时调用，也不会从破损的 face 渲染任何子 slot。不可用界面保持 composer 布局，但不声明会话、草稿或任何会话行为。

## Verification

`packages/client/hmr/tests/transport-fallback.client.spec.ts` 固定 http(s) 与 `dsh-app:` 的载体选择、fetch 请求形状、被拒流的重连与每次断连一条报告，以及销毁中断在途请求时的静默；既有 transport 套件继续覆盖外壳传输、帧隔离与 EventSource。

`apps/desktop/tests/host-process.spec.ts` 通过真实子进程驱动新控制请求并断言关联行；`apps/desktop/tests/main-startup.spec.ts` 连续 boot 两次，断言每次返回 Host 当前报告的行，而不是启动时捕获的行。

`packages/client/ui-conversation/tests/input-bar.client.spec.tsx` 在无注入 props 时渲染公开条目，断言不可用 dock 且没有编辑器。

`pnpm exec tsc -b packages/client/hmr/tsconfig.json packages/client/ui-conversation/tsconfig.json apps/desktop-host/tsconfig.json apps/desktop/tsconfig.json` 通过。

对已发布 Web 组合的探针（`launchWebScaffold`，真实 Loader、真实 Chromium）显示 `POST /api/botharness/appearance-control` 返回 200 与客户端注册，因此与桌面故障一同报告的 appearance-control 404 是 Host 在页面轮询期间被替换的症状，而不是路由缺失；启动行新鲜度与流修复消除了该轮询无法恢复的状态。

端到端验证：用重建后的外壳、Host 与客户端 bundle 重启 online 开发外壳，再在运行中的 DevTools 连接下重载。页面带着可用的 composer 完成启动，没有 `[data-slot-error]`、`[data-factory-error]` 或 `[data-composer-unavailable]` 节点，也没有请求失败；唯一的 `GET dsh-app://app/plugins/events` 经 fetch 载体提供（没有 `EventSource`/`net::ERR_FAILED` 记录），`POST dsh-app://app/api/botharness/appearance-control` 在插件轮询与探针中均返回 200。控制台仅剩 Electron 开发期 CSP 警告与两行 `[mcp-connector]` 信息日志。

## Alternatives considered

**图变化时由 Host 推送新行。** 拒绝：运行中的页面已通过事件流收到图，推送只为文档加载这一个场景重复通道，并把 Host 的图发布耦合到外壳 IPC 协议。

**读取 Host 渲染的 index，而不是外壳自己的 dist。** 拒绝：外壳有意拥有自己的文档（首屏、离线与崩溃界面、boot-ready 门），使用 served index 会让外壳在启动前依赖 Host 的 HTTP 监听器。

**保留 `EventSource`，只对网络错误做特殊处理。** 拒绝：这是传输层限制，不是页面可分类的状态；fetch 读取器就是外壳隧道已有的同一协议实现，一个读取器覆盖两种载体。

**让 `InputBar` 逐 hook 判断。** 拒绝：React 禁止条件式 hook 调用，部分 face 也不是主体建模的状态；守卫属于已经知道 face 缺失的条目边界。

## Consequences

重建、插件安装或禁用之后的桌面重载现在会装载当前图。代价是每次页面 boot 多一次 IPC 往返（受既有控制超时约束，失败时回退到缓存行），并且 Host 必须在外壳生命周期内保持该控制处理器注册。

桌面事件流现在能在 Host 重启后自行重连，代价是一秒延迟与每次断连一条日志；页面不再依赖浏览器自有的 `EventSource` 重试行为。

composer 的 inject 丢失状态渲染惰性条而不是抛错。slot 仍通过 `ui-renderer` 记录注入失败，该诊断保留，但失败不再级联到会话作用域。
