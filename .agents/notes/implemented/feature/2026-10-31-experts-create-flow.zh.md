# Agent Note:「我的专家」里的远程专家创建流程

Status: implemented

[English](2026-10-31-experts-create-flow.md) | 中文

## 问题

「我的专家」页面的创建菜单原先按专家类型各派发一条引导提示词，「新建远程专家」得到的是一段对话式引导，而不是真实的创建流程。SDKWork Agents 的 PC 应用早已拥有产品级流程——基础信息对话框（名称、头像、类型、简介，「下一步」持久化智能体），随后是完整编辑器（系统提示词、模型、记忆、能力、预览调试）——而 fork 的惯例本就是嵌入兄弟 SDKWork PC 界面，剩下的问题只是如何接进 `ui-sdkwork-markets`，同时不把 Agents PC 应用的整张依赖图拖进市场 bundle。

## 决策

### 能力包导出一条策展的创建界面子路径

`@sdkwork/agents-pc-agents` 新增 `./create` 子路径，只导出流程所需之物：`CreateAgentModal`、`CreateAgentView`、二者的 props 类型，以及知识选择绑定（`configureKnowledgeSelectionAdapter`、`createKnowledgebaseSelectionAdapter`）。宿主不再使用根 barrel：它还再导出 chat 与 home 界面，其模块图可达 chat 传输层与 Monaco loader，而必须保留 barrel 顶层实例化的打包器无法把它们摇掉——嵌入 barrel 把三者全部拖进了 bundle。这条子路径同时把知识绑定从 `./services` 子路径里隔开——后者的 index 再导出 `agentChatService`，会拖进同一张图。

### 宿主适配器沿用按包复制的适配模板

`ui-sdkwork-markets` 的 `expertsHost.tsx` 沿用每个 SDKWork 界面包各自持有一份的会话/端口适配模板（client-bundle 纯度禁止跨插件值导入）：把 Agents、Memory、Voice、Skills、Knowledgebase、Drive 六个生成客户端绑定到活动网关与 IAM 会话，随环境变化重建，上报网关就绪状态（未配置网关时创建入口禁用远程行），并持久化 Agents PC 会话令牌使核心模块自己的配置函数能看到会话。未登录时发出的请求在 SDK 拦截器链内的 fork 延迟登录闸口处等待。

两个 SDK 界面都按需代码分割加载。知识选择适配器在该加载器内绑定，而非插件 apply 时绑定，因为适配器状态住在能力包自己的模块注册表里——配置一份 fork 侧的副本，编辑器什么也读不到。

### 流程是 SDK 组件外的 fork UI

`CreateExpertMenu` 获得 `onCreateRemote`/`remoteReady` 契约：远程行进入对话框；本地与个人虚拟机两行保持原有的引导提示词派发。`MineExpertsPage` 持有三段状态（空闲 → 对话框 → 编辑器），以整页替换进入编辑器，编辑器自己的返回控件回到花名册——与「我的目录」入口对市场框架使用的整页替换同一手法。fork 可见的文案（编辑器加载、未配置提示）仍由 locale 属主；SDK 组件自身的文案归它们自己。

### 测试离开客户端测试聚合

Markets 的测试引入 Agents PC 闭包，其兄弟源码按 sdkwork 旗标集编写（没有 `noImplicitOverride`），因此测试移出 `tsconfig.client.tests.json`，进入包内自己的 `tsconfig.tests.json`——每个 SDKWork 界面包都在用的漂移守卫拆分（generations-image、drive、course……）。该工程钉止单一 React 类型身份（react-dom 19 不带内联类型，且其 `@types` 无法经 react-dom 自己的 exports map 到达），所有 dsh 说明符经构建后的 lib 解析、所有 sdkwork 说明符经兄弟包的 exports map 解析（每个包贡献恰好一个类型身份；标准套件的扩充经构建后的声明文件进入，纳入其源码反而会与 runtime lib 自身的扩充相撞）；它还暴露了四个从未被任何检查程序看过的 fork 代码真实漂移（emit 面 `noCheck`，聚合面对测试按重定向后的 lib 声明检查）：`bundleReference` 漏拷 `availability`/`official`、安装弹窗终端标签缺行级文案、New Session 入口被双 `IWorkspaces` 合并的读面类型化、spec 桩的 sessions/workspaces 形状落后于 runtime 契约。

## 其他备选

- **为创建流程新建 fork 包**（`ui-sdkwork-experts`）：流程是既有「我的专家」页面的一个入口，不是一种模式；第二个包会引入整套 cordis/slots/seed 脚手架，并把页面的状态机切过一个包边界。
- **在插件 apply 时急切配置知识适配器**（经静态 barrel import）：这会让每个部署的每次启动都加载编辑器的完整依赖图，包括从不打开该流程的部署——代码分割加载器存在的意义正是让从不打开它的宿主分文不付。
- **通过删除 chat/home 再导出修复兄弟包的 barrel**：那些导出服务于独立的 Agents PC 应用；宿主经 `./create` 收窄分文不费，对属主仓库自己的 bundle 也毫无改变。

## 后果

- fork 新增六个兄弟 workspace 成员与四行 catalog，上游同步与 CI 检出因此携带更宽的兄弟 pin 集（在线 pin 由 `scripts/sdkwork-sources.manifest.json` 属主；release runner 按闭包分析器的映射内联兄弟源码）。
- markets bundle 因编辑器自身的闭包（聊天输入编辑器框架、模型与记忆选择器、Drive 图片上传）而增大——这是被嵌入能力的固有成本——而 chat/home 面与 Monaco loader 经 `./create` 子路径留在 bundle 之外。
- `tsconfig.client.tests.json` 的排除意味着聚合不再检查 markets 的测试；`packages/client/ui-sdkwork-markets/tsconfig.tests.json` 成为该包源码与测试唯一的类型检查器，包每次变更都必须运行它（或接入 typecheck 通道）。
- 远程专家类型与个人虚拟机/本地类型的执行通道从此分叉（嵌入式 SDK 流程 vs 会话派发）；专家目录 store 日后落地时，其花名册条目应链接进同一编辑器，而不是为远程专家重新引入提示词派发路径。
