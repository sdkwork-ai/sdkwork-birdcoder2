# BirdCoder 更新日志

本文件只记录**当前版本**——`##` 标题就是本次发布打的 tag，不累积历史版本条目；往期条目随各自版本的提交保留在 git 历史里（`git log -p CHANGELOG.md`）。「上游变更」逐字摘自上游该 release 的官方 Release notes（中文部分，英文版见各 Release 页面）；「BirdCoder 本地修改」记录 fork 在该版本上的自有变更（SDKWork 组件、品牌、打包与部署等），不受上游发布节奏影响。

## 0.2.2-alpha.2（上游发布 2026-10-28，本地同步 2026-10-28）

Fork 同步：merge `674a2e2c09`（2026-10-28），上游 637 个提交、差量 2118 文件（合并后 +140541 / −29412，其中上游删除 22 个文件），窗口为 `22ddee3792`（dsh-v0.2.1-rc.3）→ `f3803c9697`（dsh-v0.2.2-alpha.2），含 `dsh-v0.2.1-rc.4` 与 `dsh-v0.2.2-alpha.1/alpha.2` 两个 release 提交。上游 Release：[v0.2.2-alpha.2](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-alpha.2)。本次为真实双亲合并提交（`git merge --no-ff`，非 squash / rebase / cherry-pick），上游提交的作者、日期、commit message 与代码注释原样进入历史。

### 上游变更

#### 新增功能

* 插件管理页支持展示富文本详情，并改善页面布局和导航行为。 @turtle1999, @turtle2099
* 插件管理支持更新第三方插件包；热更新失败时会尝试恢复旧版本。 @turtle1999, @turtle2099
* 支持将聊天文本作为引用插入输入框，并在发送后显示紧凑预览。 @lsdsjy, @imccyu
* 支持将完整历史交会话复制为 Markdown，包含可用的原始日志路径。 @tianyicui
* 工作步骤收起后保留全部助手文字回复，可切换为仅最终回答。 @imccyu
* 新增日语、西班牙语、法语、德语、俄语和巴西葡萄牙语文案与界面配置。 @07akioni
* 自动化任务页支持确认后一次清除全部已结束任务，保留进行中的任务。 @Chinesezjc
* 新增实验性「`subagent_oar`工具」插件，可将独立任务交给本机 Codex 或 Claude CLI @tianyicui
* 新增实验性「个性化推荐」插件，按需在回答下方提供官方插件启用卡片或个性化页面创建卡片。 @ZiyaZhang
* 新增实验性「开发者工具 - 统计」插件，按轮次和步骤查看上下文、缓存、模型与工具耗时等统计。 @mektpoy
* 新增实验性「变更请求与工作树」：可在独立 Git 工作树中运行会话，查看关联 PR 的状态和代码差异。 @LegGasai, @tianyicui

#### 体验优化

* 改善手机和平板输入：减少自动弹出软键盘，发送后收起键盘，修正键盘平移页面时的光标滚动。 @Stevring
* 窄屏浏览器设置页采用全屏与横向导航，聚焦项自动完整滚入可见区；触屏任务文本输入使用 16px 字号。 @Stevring
* 触屏动作不再被悬停提示阻挡，工作区与归档结果操作直接可达；宽 Markdown 表格在局部容器中滚动。 @Stevring
* 窄会话栏中，溢出的头部状态入口会渐隐，避免遮挡"在应用中打开"等工具按钮。 @turtle2099
* 恢复窄窗口下输入框模型选择器自动折叠为图标的行为，完整模型名仍可在菜单中查看。 @LegGasai
* 修复手机及窄窗口下字体设置输入框挤压标题和说明的问题，字体输入行改为纵向排列，字号控件保留右对齐。 @EricMoin
* 同名工作区在选择器中显示最短区分路径后缀，窄屏优先保留后缀。 @turtle2099
* 共享描边按钮使用按 DPR 调整的内描边，改善 Safari 分数尺寸下的细线显示且不改变布局。 @Stevring
* 运行状态位于当前工作轮次尾部、待处理插话之前，方便区分运行中和排队中的消息，并改善界面布局抖动问题 @imccyu
* 会话列表支持插件图标，并改善键盘与触屏操作。 @LegGasai
* 侧栏会话悬浮卡显示工作目录，便于区分未分组或同名会话。 @turtle2099
* 优化侧栏空间布局，改善响应区域，平滑搜索框展开与收起。 @Yifffan
* 侧栏搜索支持不区分大小写的会话 ID 子串匹配。 @turtle2099
* 消息在宿主确认接收后才显示并清空草稿；发送期间输入框只读，发送失败时保留草稿、引用和附件。 @LegGasai
* 图片上传方式调整为进入输入框后立即上传，发送消息时复用已上传的图片。默认单张图片上限提高到 50 MiB。 @LegGasai
* 已回答的问题批次以消息气泡显示，原生与 PTC 调用的回答在过程折叠后仍可回看。 @Kaige-Gao
* 悬浮侧栏面板拖过屏幕边缘时有阻力，松手后弹回可见区域；窗口缩小时保持控件可达。 @yudshj
* 支持中键关闭右侧栏标签，关闭后台标签不改变当前选中项，并保留不可关闭的起始页。 @Kingwl
* 修复工作步骤展开和收起时的正文跳动、滚动回跳与空白间隙，保持运行状态可见。 @imccyu
* 点击聊天中的文件行号链接后，代码和文本预览以短暂高亮标出目标行并淡出。 @turtle2099
* Trajectory 结果页新增实时工具返回值的原始 JSON 查看，并与渲染结果上下展示 @kermanx
* Search 功能优先向模型提供 Search API 长摘要，默认每来源最多 800 字符；搜索卡片仍展示短摘录。 @yudshj
* 模型选择器默认勾选已配置模型，可一次添加或移除候选并保留自定义值；筛选后的全选只作用于可见候选。 @turtle2099
* 对通过 pi-ai 接入且不支持在对话中追加系统消息的模型，后续系统消息会在原位置作为提醒提供，不会移到最初的提示词中。 @Tuyixiang
* 支持在 DeepSeek 与 pi-ai 提供商内拖动或用方向键排序模型，保存后保留顺序及完整模型参数。 @Magolor
* 输入框统计读数被截断时，可通过提示气泡查看完整数值；会话统计也显示轮次与步骤数。 @turtle2099
* Auto 自动审核支持在连续工具调用之间更好地复用历史上下文缓存，减少重复处理。 @turtle2099
* 后台任务完成通知直接携带小体积输出，并减少已读取结果和子代理收尾消息的重复通知。 @turtle1999
* 子代理等待指引减少 sleep 和重复轮询：只有结果尚未返回时，结束当前轮次等待完成通知。 @Chinesezjc
* 远程连接默认启用 WebSocket 压缩，减少大量历史消息的传输量；可通过 `websocketCompression` 关闭。 @imccyu
* Web 静态资源支持 ETag 条件请求，未变化的资源返回 304，减少重复下载。 @imccyu
* Word 常规编辑在保存并核对内容与格式后即可交付，减少不必要的 ZIP、XML 与元数据检查。 @tianyicui
* 加快 Web 预览中源码编辑器等懒加载组件的首次打开。 @turtle2099
* 加快带固定目录前缀的文件查找，跳过无关目录，同时保持结果与排序规则不变。 @kermanx
* 支持拖动平移超出视口的图片，并通过应用内拖放或桌面原生拖放交付原始文件。 @std4453
* 手机和平板打开宿主文件后会提示操作已在其它设备执行；各端失败时显示错误提示，电脑端成功保持静默。 @Stevring

#### 问题修复

* 全局与项目 AGENTS.md 分别使用 maxBytes 预算，避免项目指令挤掉全局指令；同时包含两条链的消息总量最多为原配置的两倍。 @ZiyaZhang
* 切换到较小上下文模型前先用原模型压缩历史；失败时停止切换请求并保留原请求头。 @Dudu-0223
* 使用 Gemini 的 OpenAI 兼容 Chat Completions 接口时，工具调用会保留并在后续请求中带回所需的思考签名，避免因签名缺失导致请求拒绝。 @turtle2099
* 系统提示词未变化时，新一轮模型请求可继续复用已有上下文前缀缓存，避免不必要的缓存失效。 @mektpoy
* 缺少所需凭据时不向模型提供 Web 搜索工具；新版 Web API 的抓取工具也按凭据就绪状态提供。 @LegGasai
* 修复关闭应用时 Auto 会话权限意外变成完全访问的问题，保留已保存的权限与审批策略。 @tianyicui
* 等待后台任务输出时，用户插话可立即解除等待并返回当前输出，后台任务继续运行。 @mektpoy
* 修复预设往返切换后委派工具暂时缺失的问题，并让委派工具遵循当前 Agent 的工具限制。 @Dudu-0223
* 被阻塞的目标可从 Web 目标栏继续；已耗尽轮次上限时仍需先提高上限。 @turtle2099
* `sdk-minimal` 配置在请求模型或执行工具前保存会话恢复记录；保存失败时不会继续相关操作，提高短会话中断后的可恢复性。 @LogosVeritas
* 本地文件工具将开头的 \~ 或 \~/ 正确展开为宿主主目录，路径中间的 \~ 保持字面含义。 @turtle2099
* 修复多选问题有多个推荐选项时只预选第一项的问题，现在卡片打开时预选全部推荐项；单选和已回答卡片的行为保持不变。 @yudshj
* 聊天中的相对文件链接按点击时会话当前工作目录打开，进入 worktree 后不再误开原项目文件。 @turtle2099
* Markdown 中单个 \~ 保持字面显示，只有 \~\~ 才形成删除线。 @turtle2099
* 修复跨行 $$ 数学块的渲染，保留首行公式内容及公式后的正文。 @Chinesezjc
* 本地 Markdown 图片被覆盖后，新消息和新打开的预览会显示当前文件，而不是复用旧图。 @turtle2099
* 修复裸 URL 将后续中文标点及正文一并识别为链接的问题 @turtle2099
* 修复 Markdown 中 Windows 文件路径的反斜杠被转义删除，导致链接或图片打开错误位置的问题。 @turtle2099
* 交付卡与收尾回复中的文件引用覆盖整轮，包括回复之后的交付与写入；present 说明等待用户回答前应先提供文件链接。 @yudshj
* 修复部分结构体代码高亮导致页面长时间卡死的问题。 @yudshj
* 修复输入框粘贴文件或文件夹路径时仅高亮目录前缀的问题。 @turtle2099
* 断线或重连期间暂停聊天运行计时，连接恢复后按轮次起点恢复显示。 @turtle2099
* 停止后补发的插话与新消息在轨迹中按日志顺序显示于助手输出之前，刷新和历史加载后仍保持一致。 @kermanx
* 侧栏原生拖动使用独立主题背景预览，避免混入后方消息内容并保留排序。 @Stevring
* 深色主题设置导航的悬停背景可见，选中态保持优先。 @turtle2099
* 长问题和选项说明可原地展开与收起，内容区滚动时导航与提交按钮保持可见。 @yudshj
* 修复 macOS 激活窗口时点击会话标题误触发重命名，正常双击重命名保持不变。 @turtle2099
* 切换、打开或关闭侧栏文件标签时，标签栏从原滚动位置继续，不再先跳回最左端。 @turtle2099
* 普通会话分支现在独立运行，不再被误识别为子智能体；真正子智能体仍保留创建者关系。 @Dudu-0223
* 安装自托管 Git 插件时，HTTPS 无法读取而 SSH 可用时改用 SSH。 @turtle2099
* 安装含 prepare 脚本的 Git 插件时，显示脚本授权和重试选项，不再仅报告未知错误。 @turtle2099
* 审批提示明确说明是否向用户请求授权，避免模型误解 never 策略。 @turtle2099
* 修复 macOS 持久 Bash 工具中感叹号被历史展开改写或导致命令超时的问题。 @grllll
* 明确告知模型：用户跳过提问后应继续，不重复追问，也不能把跳过当作授权。 @turtle2099
* 修复一个技能根目录读取失败导致其他目录中的技能也不可用的问题，保留可用技能并提示不完整的发现结果。 @Dudu-0223
* 配置项目按自身 ESM 规则解析插件依赖子路径、包内导入和自引用。 @shigma
* Web Fetch 可读取编码声明混含 UTF-8 的可读页面。 @Dudu-0223
* 修复工具调用因无歧义的可选参数而失败的问题：grep 接受空 include。 @turtle1999
* 修复以管理员权限运行 DSH 或在 Windows Sandbox 中使用时，受限沙箱命令无法启动的问题；文件写入和删除限制保持不变。 @huoyaoyuan
* Windows 已安装应用显示正确的发布者名称，卸载列表中的应用名称不再附带版本号。 @winewill
* 改善 Windows 安装器进度页绘制、拖动与窗口激活表现，恢复系统最小化动画，并让标题按钮在原区域松开时触发。 @winewill
* 桌面 Host 完成任务清理并确认关闭后立即退出，避免遗留事件循环句柄阻塞更新安装。 @turtle2099
* macOS 桌面更新在确认前等待退出全屏，安装失败后恢复工作区；退出全屏超时则保留任务并提示重试。 @winewill
* 桌面更新提示改为窗内视图，后台结果更新不再抬升原生子窗口；更新提示随应用浅色或暗色主题显示。 @winewill
* 修复 macOS 桌面端会话头部菜单与按钮之间出现过大空隙的问题。 @turtle2099
* 修复 macOS 原生目录选择框初次显示后灰显、目录无法点击的问题。 @EricMoin

#### 其他变更

* DSH 的最低 Node.js 版本提高至 24.9；使用旧版 Node.js 的用户需先升级运行时。 @tianyicui
* SDK 提供与 Web 模式一致的文件交付、问答、调度、技能和上下文能力，并支持问答回调与操作审批。 @koalazf99
* 修复会话创建、恢复和销毁期间的事件发布与清理顺序；初始化事件可实时订阅，取消时等待已取得资源完成清理。 @kermanx
* Session API 新增独立接口，可分别读取快照和持续订阅会话事件日志、运行状态以及事件投影数据。 @imccyu
* 自定义插件需迁移到异步会话投影句柄，旧注册释放函数与按 key 读取保留兼容和弃用提示；审批状态恢复要求组合提供 sessionProjections 并等待服务激活。 @kermanx, @Magolor
* 整单元 JSON 与 SQLite 存储支持读取领域明确声明的兼容旧版本，并以新版本格式写入。 @Magolor
* Web Fetch 不再拒绝非公网地址，可用于代理与内网，部署应自行限制网络访问。 @turtle2099
* Cordis Timer 实现同步上游，自定义插件需适配返回值 @shigma
* Cordis Fiber 提供统一的原始配置、候选配置解析和生效配置访问，设置编辑与热更新使用一致的配置来源。 @shigma
* 桌面启动故障可获取诊断报告，并附上有界的近期插件操作记录，便于排查问题。 @winewill
* macOS Computer Use 新增系统与应用权限引导，支持长按并改善应用启动；应用授权可跨重启保留。 @CreatixChu, @koalazf99
* Headless 支持实验性 Auto 自动审核 @tianyicui
* Ralph 循环与会话搜索继续随包分发，但默认从 GUI 隐藏；可在添加插件中输入包名显式启用，已有配置仍可管理。 @ZiyaZhang
* 升级 pi-ai 至 1.3.0，并同步模型目录、端点与推理回放规则；完整工具参数格式错误会在执行任何工具前终止该次响应。 @tianyicui
* 未声明容量的自定义模型默认上下文与最大输出调整为十进制 1M/128K；较小端点应显式覆盖容量以避免延迟压缩。 @LegGasai
* Agent 在提示词组装与 pre-step 前固定本步模型，重试保留同一选择；插件应通过 agent.model 选择模型，agent/request 不再允许改路由。 @kermanx
* 「自定义插件市场」更名为「自定义插件索引」，发现页读取用户添加的索引文件，索引生成器排除标记为 private 的版本、标签与默认分支包。 @turtle2099, @turtle1999
* 官方组合包列表改由 @deepseek-ai/dsh-official-bundles 导出；自定义集成需更新原 app-boot 的相关导入。 @turtle2099
* 工具可按步骤条件启用，模型声明、PTC 绑定与执行准入保持一致；插件需迁移 tools.resolve/executable 与提示词组装接口。 @LegGasai
* Node PTC 新增 VM Script 模式，支持顶层 await、动态导入和表达式结果，可独立开启跨调用状态保留；默认仍逐次执行，脚本顶层不支持 return 或 using。 @kermanx
* 原生与 PTC 工具执行拆为按 Agent 作用域选择的插件；PTC 通过配置 overlay 启用，旧 tools.mode 与 DSH\_TOOLS\_MODE 需迁移。 @kermanx
* PTC Node 控制通道改用 birpc；自部署 bootstrap 与 SSH helper 必须同步升级，SSH 协议从 2 升为 3。 @kermanx
* PTC Mode 中由调用方取消的 run\_code 改为返回 ABORTED，而非 CODE\_RUN\_FAILED；SDK 和 Session 消费方需更新取消分类。 @kermanx

### BirdCoder 本地修改

#### 🔀 同步面与历史修复

- **同步锚点**：本轮窗口 `22ddee3792..f3803c9697`（637 提交 / 2118 文件），锚点已更新为 `f3803c9697`、tag `dsh-v0.2.2-alpha.2`、merge `674a2e2c09`，下一轮从该 sha 增量继续。回滚点为 tag `backup/pre-sync`（旧 HEAD `f287a66a`）。
- **历史修复（不改写任何现有提交）**：本地 main 在 2026-10-25 被重写为 15 个提交的孤立根（`91bf31089f`，无父提交），与上游失去共同祖先，直接 merge 会被 git 拒绝（`unrelated histories`）。修复方式是在旧 HEAD 之上新建桥接提交 `f287a66a`（树与原 HEAD 完全相同，父提交 = 旧 HEAD + 上游锚点 `22ddee3792`），恢复可用的 merge-base 后再做 `--no-ff` 合并。旧提交、提交信息与文件内容零改写。
- **冲突规模**：36 个冲突文件（35 双改 + 1 删除/修改），全部逐文件裁决，未使用 `--ours .` / `--theirs .` / `-X ours` / `-X theirs`。

#### 🛡️ 保留的 fork 面

- **品牌资产**：`apps/desktop/README.md` / `README.zh.md` 保持 `# BirdCoder Desktop` 标题与 fork 章节目录，只采纳上游新增的「恢复与诊断」段落（指向新文档）；新增 `docs/diagnostics` 双语页把日志路径与实例提示改回 `~/Library/Logs/BirdCoder` 与 BirdCoder 实例文案；`fatal-address-in-use-{en,zh-CN}.txt` 期望文案保持 BirdCoder 并叠加上游新增的「诊断报告未能保存」提示。
- **SDKWork 组件面**：`packages/client` 下 1298 个 sdkwork 路径合并前后一致；`tsconfig.client.json` 保留 `ui-sdkwork-updater` 引用；`verify-npm-install-layout.ts` 保留 fork 的 1,382,850 解析预算（fork 依赖图大于上游）；`tsconfig.client.tests.json` 的 sdkwork 项目引用不变。
- **桌面打包/发布面**：`desktop-build-paths.mjs` 保留六目标与 `platform/arch` 推导（上游 map 只覆盖 3 目标，会漏掉 linux/win-arm64）；`upload-target.ts` 的 COS 三目标守卫保留并叠加上游 `--purge-only` 校验与 dotenv 错误包装；`electron-builder-config.mjs` 保留 `lib/*.js` + `lib/*.cjs` glob（已覆盖上游新增的 `operation-report-worker.js`）；root `package.json` 保留 fork 的 `clean: sdkwork-app clean` 与移除 npm/desktop 脚本链的决定。
- **CI 面**：`.github/workflows/ci.yml` 保留 fork 单文件自托管车道（python-sdk / python-runtime / windows-build / windows-native-tests），同时并入上游新的 `node-24-lint` 车道；`release-publish.yml` 维持 fork 删除。
- **插件 seam**：`ui-workspace` 行菜单保留 fork 的 `contextPoint` / `reportMenuOpen` 右键通道与内置 fallback 菜单，叠加 `DRAG_PREVIEW_PROPERTIES`；`ui-conversation` 保留 seat/header 拆分与 fork 的 `session.header.surface` / `leading` slots，采纳上游对 breadcrumb overlay 的 portal 约束；`ui-open-in-app` 测试保留 fork 的 `useSelector` helper 并加入上游 `report` 回调。

#### 🔧 采纳的上游面

- 诊断报告与近期插件操作记录（`installOperationDiagnostics`、`formatFatalDiagnostic`、`operation-diagnostics.ts`、`apps/desktop/docs/diagnostics/`）；桌面语言缓存 `writeDesktopLocaleCache` 与 Windows 语言分支；`ui-trajectory` 拆分为 host/client 双解决方案（root 改为 `files: []` + references，`tsconfig.client.json` 指向 `tsconfig.client.json`）；PTC 运行时 tsdown 新增 `configuration.js` 入口与 `acorn/acorn-walk` 打包依赖（保留 fork 的 `deps.alwaysBundle` 写法）；`prepare.ts` 采纳上游新 manifest 字段；`verify.ts` 的 `--skip-tag-check` 不适用（fork 无 npm 发布链），仅吸收上游文档语义。
- **锁文件**：`pnpm-lock.yaml` 按规范取上游版本，合并后需重新执行 `pnpm install`（见下方待办）。

#### 🗑️ 删除审计

- 上游本窗口删除 22 个文件，fork 侧全部跟随删除且无额外误删：`packages/client/ui-deepseek-model-label-1017/`（整包，18 文件 + 1 个 e2e）、`ui-open-in-app/src/client/open-failure-toast.tsx`（上游改为 `open-toast.tsx`）、`ptc-runtime-node/src/persistent.ts`、`skill-office/tests/visual-intent.e2e.ts`。同步移除了 `tsconfig.client.tests.json` 中指向已删包的陈旧引用。

#### 📦 待办（合并后处理，不在本轮修）

- `pnpm install` 重建 lockfile 与 node_modules（锁文件取上游，fork 新增依赖条目需重新解析）。
- 仓库根 `README.md`（14 个标题）与 `README.zh.md`（10 个标题）配对不一致为合并前既有问题，`doc-sync` 会报错，需补齐中文侧后重录。
- root `package.json` 中 fork 已移除的 `test:bench*` 与 `desktop:*` 脚本链未恢复；如后续需要 bench，按上游 `scripts/run-bench-suite.ts` 重新接线。
- `prepare-runtime-patches.spec.ts` 的 `workspaceOnly` 期望按合并后 `pnpm-workspace.yaml` 的 13 条 patch（2 条 runtime + 11 条 workspace）更新为 11；`ci-workflow.spec.ts` 的 worker 上限按新增 lint 车道从 10 调整为 11。
