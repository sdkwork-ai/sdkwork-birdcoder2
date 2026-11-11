# Agent Note: The persona-bot plugin ships from its git submodule and the assistant owns the rail cell

Status: implemented

[English](2026-11-08-deepseekbot-assistant-surface.md) | 中文

## Problem

本 fork 的模式栏提供首页、各生成模式、应用商店、知识库、课程、云盘、资产、搜索和 Token Plan，其中没有任何入口通向 persona-bot 层（DeepSeekBot，上游已更名为 Tobs）：那个让 agent 拥有持久身份、记忆与消息能力的第三方插件。本次产品要求集成的仓库——`BotHarness/DeepSeekBot` 的 `sdkwork-ai/sdkwork-deepseekbot` 镜像——就是本 fork 眼中该插件的上游，它既不提交宿主半的 `dist/`，也不提交浏览器半的 `lib/`。最初的集成改用已发布的 npm 闭包取得这些产物，但助理命名（助理 / Assistant）、右侧 Dock tabs 与「助理设置」改名在镜像的 `main` 上就已落地，早于任何发布，而产品要求插件来自 git，而不是某个 registry 版本。

该插件也不发布面板渲染服务。它的浏览器半把整个界面注册为一个 keyed `main` 面板（`botharness`），外加一行 `sidebar.panellist`；选中该面板时，它通过 `sidebar` 遮蔽把左栏换成自己的 Bot 模式侧栏。宿主若想把界面放到别处，就只能复制它的组件树或重新注册它的槽位，而这被第三方插件只读规则禁止。

## Decision

**插件是本仓库自行构建的 git 子模块。** `plugins/sdkwork-deepseekbot` 固定 `sdkwork-ai/sdkwork-deepseekbot` 的 `main`。它的三个运行时包是 workspace 成员，因此 `packages/bundle/web-app` 以 `workspace:*` 依赖它们，Web bundle、Desktop runtime 与 Desktop 开发项目解析到的都是本检出的构建。`scripts/build-deepseekbot.mjs` 运行子模块自己的 `tsdown` 工具链（因为子模块根是 workspace 成员，本仓库的 `pnpm install` 会装好它）：一次在 `pnpm install` 之后，另一次作为 `build:artifacts` 的门。只有当它的内容戳记（`.dsh-build/deepseekbot-build.json`）同时匹配构建输入的哈希与它产出的每个产物时才会跳过，因此热安装没有额外开销，也不会把检出或改动过的旧产物误当成当前构建。插件提交与产品之间不再隔着任何 registry 发布。`cordis.patch.yml` 挂载 `botharness-core`（Bot 注册表、记忆仓库、`/api/botharness/*` 路由、Bot 会话驱动、`agentPreset: deepseekbot`）、`botharness-client`（浏览器半）与 `preset-deepseekbot`（插件生成的 agent preset）；插件自带的 `dsh.bundle.patch` 不进入 profile 的 bundle 列表，因此这些行就是唯一的挂载点。

**发布输入自带插件的 tarball。** 运行时包是私有的、版本为 `0.0.0`，所以 `dsh` 发布家族无法承载它们，而打包后的 `@deepseek-ai/dsh-web-app` 清单会把它们写成 `0.0.0`。`scripts/release/pack-assistant-plugin.ts` 把它们打包到 dsh 家族旁边，于是 Desktop 的 package-set 闭包能从同一输入集里选中它们，packed-install 验证也从同一输入集解析它们；`sdkwork-deepseekbot` 自身的 tarball 会用一份改写过的清单重新打包，指向本部署真正挂载的两个包，而不是它的 `link:` 同级源码。任何东西都不发布到 registry，打包后的 bundle 也只有和这些 tarball 放在一起才有意义。

**发布边界会拒绝模块表无法满足的浏览器 bundle。** `scripts/release/pack-assistant-plugin.ts` 扫描构建出的 `@botharness/ui` bundle 中裸 `require()` 的说明符；只要有一个既不是 `PLATFORM_MODULES` 种子、也不是启动图会物化的 `dsh.client.external` 声明，打包就会失败。`scripts/client-build-environment.ts` 也会把 `plugins/*/packages/client/lib/client.js` 纳入摘要，因此打包的字节就是构建记录的字节。没有这道检查时，一个把 `@tanstack/react-query` 外置的陈旧 bundle 会作为发布产物出货：浏览器在导入时丢掉整个插件（`require("...") missed the module table`），跟随插件 `botharness` 主面板的助理图标也随之消失，而开发启动仍能正常工作。

**助理的身份属于本 fork，而不是插件的产品品牌。** `botharness-client` 行设置 `botIcon: bot`，因此 Bot 模式侧栏 logo 与未自定义头像的总管 Bot 都绘制模式栏图标使用的机器人标记。插件的侧栏头部渲染本地化助理名（`tob.defaultName`：助理 / Assistant），而不是产品字标；preset 行注册为「助理」。因此无论导航还是插件自己的表面，助理的名称与标记都由本 fork 决定；插件仓库用 ADR 0304、0305 记录该命名决定。

**表面的控制列由宿主提供。** `ui-sdkwork-assistant` 在挂载期间于 `<html>` 上声明 `data-bh-host-rail`。被链接的 workspace 读取它：不再创建自带的 56px 图标栏，关闭从已存布局恢复的那一栏，并把窄于 200px 的频道列补到 260px。因此表面只保留一个控制列——本 shell 的模式栏——其左边缘是频道列表而不是图标条；面板切换、助理设置与退出仍可通过 dock 的子面板开关、DSH 设置和宿主外壳到达。插件的 ADR-0306 记录该约定；未声明该属性的独立应用保持自己的图标栏不变。

**助理模式栏图标属于一个 fork 包。** `packages/client/ui-sdkwork-assistant` 在新的 `assistant` 模式 id 下注册一个 keyed `mode.rail.entry`，位于模式栏顺序第二位（紧挨首页下方），并属于固定的不可隐藏集合。图标承载产品文案「助理」/ Assistant 与机器人头像图形——静止为描边、选中为实心，与模式栏其它图标一致——点击时通过 `ctx.layout.selectPanel('botharness')` 选中插件面板来打开界面，这与插件自己侧栏行使用的导航完全相同。插件的界面、侧栏遮蔽和设置分区仍然是它自己的注册。

**左栏入口使用侧栏自己的快捷入口座位。** 同一个包注册一个 `sidebar.actions` 条目（id `sdkwork-assistant`，order 35，紧接定时任务之后），以该座位的 16/18px 尺寸渲染同一个机器人图形与「助理」文案，没有美术字背景、没有角标——几何、悬停反馈和文案位置都与紧挨着的定时任务条目一致。插件自带的 `sidebar.panellist` 行（用头像美术字和「试试看」引导角标绘制）通过 `ctx.sdkworkSidebar.suppressPanel('botharness')` 被抑制，因此每列对同一表面只保留一个入口。该抑制跟随侧栏服务：没有这一列的部署仍有模式栏图标，卸载本包则恢复插件自己的行。

**图标跟随面板，而不是跟随模式栏。** `assistant` 永远不会成为框架的当前模式：框架在 code 表面内渲染被选中的主面板，因此模式始终是 `code`，否则模式栏的各模式图标会一直点亮首页。图标因此从 `usePanelInfo`（面板选择）取得选中态，`ModeRail` 在选中主面板期间给所有模式图标传 `active: false`。图标的注册以 `botharness` 主面板条目是否存在为前提：停用插件行的 profile 不会出现死图标，插件卸载时图标随面板一起移除。

**已存储的模式栏布局会把新模式采纳到首页旁。** `normalizeLayout` 现在把存储顺序中缺失的模式放在它前面最近的、已存在的出厂模式之后，而不是追加到末尾。因此已有用户的模式栏会按产品发布的位置显示助理图标，而不是在末尾。

**助理的输入框渲染外壳的对话模型选择器。** 外壳的模型选择插件把 composer 选择器注册为根作用域的 `model.select` Component Factory，复用的正是对话座位渲染的同一个 `ModelSelect`。`ui-sdkwork-assistant` 的主面板条目把渲染器的 `renderFactorySlot`、IAM 登录闸门与会话模型目录读取器下传为宿主能力，助理输入框用该会话目录（Home 渲染的同一份目录）与 Bot 路线构造目录快照并渲染该工厂——触发按钮、两级菜单、按提供方搜索、角标、推理等级行与登录闸门全部来自对话选择器。登录闸门使用 IAM 的原地入口，因此预览模型的登录请求会打开外壳的浮层，而不是把屏幕交给桌面欢迎页；助理视图保持选中。由于选择器直接读取该目录，提供方分组（BirdCoder 在最前，其后是账号提供方）、模型名、登录预览与提供方失败信息在任何登录状态下都与 Home 完全一致；Bot 目录仍是模型计划编辑器与校验来源，本地菜单仅作为独立 BotHarness 组合（没有该外壳插件）的回退保留。完整编辑器（预设与执行模型）保留在 Bot 资料入口与模型命令中。Bot 没有自己的计划时仍继承外壳默认模型，因此同一份默认配置同时作用于两处会话；`dm-composer-context.test.ts` 与 `assistant-model-picker.test.ts` 覆盖宿主工厂、会话目录快照、独立回退与目录映射，`model-credential-health.test.ts` 覆盖 Bot 目录的登录预览。

## Alternatives considered

**固定版本的 npm 闭包。** 最初的集成按已发布版本安装 `deepseekbot`、`@botharness/core` 与 `@botharness/ui`。它无法采纳镜像 `main` 上的命名、Dock tabs 与设置改动（这些尚未发布），并且把 registry 发布变成产品文案的前置条件。git 才是这里插件的真实来源，因此 workspace 直接消费子模块。

**像其他插件一样使用只读 `plugins/` 子模块。** 本仓库默认的第三方插件模式假定子模块随包提交 `lib/` 产物。`sdkwork-deepseekbot` 把产物列入 gitignore，而且它本身就是本 fork 的上游，所以插件在本仓库构建，而不是按已发布产物直接运行。

**把构建产物提交进子模块。** 仅客户端 bundle 每次构建就约 23 MB，上游的 `.gitignore` 有意排除它，而且每个插件提交都会新增一个二进制版本。安装时构建更小，也不会与固定的源码脱节。

**保留 mtime 新鲜度检查。** 一次检出可能让陈旧产物比它已不再代表的任何源码都新，发布便会把该 bundle 当作固定树的产物出货。内容寻址每次构建只多一遍哈希，却消除了这一类问题。

**用模式页渲染插件。** 为 `assistant` 提供 `mode.page` 可以带着自己的外壳占满中间列。它无法挂载插件界面：插件没有发布 `render()` 式服务（不同于 `@xmanrui/dsh-im` 供 IM 连接器页跟随的 `dshImClient`），而重新注册它的槽位或复制其组件会让本仓库变成它界面的一个 fork。

**复用已有模式 id。** 把图标注册到已有模式（搜索、资产等）可以避免改动 `AppModeId`。它会劫持无关图标的选择态与页面，自定义弹窗也会显示错误的表面名称。

**把设置上方的 `mode.rail.panel` 快捷入口当作入口。** 那是 IM 连接器所在、且受支持的位置。产品要求图标紧挨首页下方，因此它必须位于模式分组内。

**同时挂载插件的浏览器与电脑行。** `@botharness/browser` 与 `@botharness/computer` 是带原生依赖（`sharp`、内置浏览器运行时）的可选能力行。本次不挂载；需要它们的部署在后续 patch 层中连同依赖一起添加。

## Consequences

- 出厂构建中助理表面在两列都可导航：首页下方的模式栏图标，以及定时任务之后的侧栏快捷入口。插件自带的「Bot 模式」行是被抑制而不是被改写，因此插件 bundle 保持原样，移除此包时该行会回来。
- 插件的发布身份是指向镜像 `main` 的 gitlink，因此 `pnpm run update:deepseekbot` 一步完成升 pin、重新链接 workspace、重建产物并运行验收规格；从未初始化子模块的检出仍可安装（`postinstall` 构建会带提示跳过，显式的构建门仍会失败）。
- 子模块根仅为构建工具链加入 workspace；它文档工具链拉入的 `puppeteer` 在 `allowBuilds` 中被拒绝，真正被 bundle 依赖的运行时包才是成员。
- 打包后的 `@deepseek-ai/dsh-web-app` 清单把插件包写成 `0.0.0`。这只有在 `pack-assistant-plugin` 写入同一发布输入集的 tarball 旁边才可解析——Desktop package 闭包与 packed-install 验证消费的正是这些输入；若要把本 fork 的 dsh 包发布到 registry，必须先有一个已发布的插件版本。
- agent preset 被复制进本 fork 的 patch，因为 preset 行按名称组合插件。插件发布若改动该组合，需要手工重新同步 patch 行；验收规格只检查 preset 行的包名。
- 助理图标是固定的：自定义弹窗可以调整顺序但不能隐藏它，因此产品的招牌助理入口不会从模式栏消失。
- 请求未种子化模块的插件 bundle 会在发布打包时失败，而不是启动成被静默丢弃的插件。助理图标只在插件的 `botharness` 面板注册期间存在，因此这种失败本会以「助理入口消失」的形式到达已安装应用。
- 助理面板打开期间没有模式图标点亮，因为主面板不是应用模式。这与侧栏发起的各面板此前的表现一致，现在在模式栏中集中说明。

## Testing

`packages/bundle/web-app/tests/built-in-assistant.spec.ts` 断言四个组合行、对子模块包的 workspace 依赖、两个插件清单的浏览器声明、构建好的宿主半、浏览器半与 preset 辅助文件、真实浏览器 bundle 只请求已种子化或已声明的模块，并拒绝每一种不完整形态。`scripts/release/assistant-client-externals.spec.ts` 覆盖外置请求门禁的解析与拒绝。`scripts/build-deepseekbot.mjs` 是这些产物的唯一生产者：它由 `postinstall` 与 `build:artifacts` 门调用，发布打包 job 则调用 `pnpm run release:pack:assistant`，让验证安装携带同一组 tarball。插件自身的 `packages/client/test/bot-mode-sidebar.test.ts` 覆盖侧栏头部显示的助理名，`packages/client/test/channel-dock.test.tsx` 覆盖宿主接管时的无图标栏形态（没有图标栏面板、频道列表存在）与独立应用的图标栏。`packages/client/ui-sdkwork-assistant/tests` 覆盖两个入口的注册生命周期、点击导航、模式栏图标的面板驱动选中态、侧栏行的文案与无美术字布局、插件行的抑制、`data-bh-host-rail` 声明的生命周期，以及两处文案。`packages/client/ui-sdkwork-app-modes/tests` 覆盖新的模式栏顺序、固定集合、面板感知的选中态以及已存储布局的邻近采纳。`packages/client/ui-model-selection/tests/model-select.client.spec.tsx` 渲染已注册的 `model.select` 工厂，其插件 spec 固定工厂的注册与移除；插件的 `packages/client/test/dm-composer-context.test.ts` 与 `assistant-model-picker.test.ts` 覆盖宿主工厂与目录到快照的映射。
