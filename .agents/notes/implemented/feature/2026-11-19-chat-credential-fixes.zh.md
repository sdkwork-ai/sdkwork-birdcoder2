# Agent Note: Chat failure-row credential fixes

Status: implemented

[English](2026-11-19-chat-credential-fixes.md) | 中文

## 问题

以 `MISSING_CREDENTIAL` 结束的轮次把修复方式写成文字：登录（随后中转会使用已登录的 Auth Token），或在 设置 → 模型 中保存该提供方的密钥。用户必须自己先找到设置菜单里的登录行、再找到「模型」页，而该页也不会指出究竟是哪个提供方的凭据刚刚失败。

## 决策

- Chat 把缺少凭据的句子拆成片段，在句子中留出两个会话级修复座位 `conversation.chat.turn-error.sign-in` 与 `conversation.chat.turn-error.model-settings`，由 `turn-error` 键控节点渲染器声明。每个座位收到稳定失败码以及句子本来就带有的本地化标签短语；座位没有注册项时 Chat 自己渲染该标签，因此在没有该功能的组合里整行仍是一句纯文本，每种语言也只有一句话。
- SDKWork IAM 插件填充这两个座位，并且只响应 `MISSING_CREDENTIAL`。登录调用 `ctx.iam.openSignInOverlay()`（产品登录入口弹窗），并在已登录时退回纯文本（通过注入的 `signedIn` 钩子）——此时中转已经拿到令牌；模型短语调用 `ctx.settingsMenu.openSection('models', { focusProvider: 'birdcoder' })`。其它失败码不渲染任何内容，句子保持原样。
- 设置外壳把弹窗可见性与当前分区从组件本地状态移入声明的 `mode.rail.settings` store，并在其中加入「定位目标」，再用与注册项渲染的同一实例提供 `ctx.settingsMenu.openSection(id, { focusProvider })`。服务接口与外壳合约放在一起。
- 外壳通过设置分区 owner 份额（`focusProvider`）把定位目标交给分区，因此每个功能分区自行决定「定位」的含义。「模型」分区把指定提供方的卡片滚入视野并短暂标记，未知或尚未加载的路由被忽略。手动导航与关闭会清除目标，因此普通访问仍保持页面原本的起始位置。

## 考虑过的替代方案

**在句子下方单独放一排操作按钮。** 把同一句指令拆成正文加一排控件，重复标签，在对话里也像临时补丁；内联链接让句子仍然是它原本的那一句指令。

**把每个操作放在其依赖所在的包。** 模型操作可以放在拥有 store 的设置外壳包里，而登录手势属于 IAM 包。两个座位让每个手势留在其所有者处、文案留在 Chat，并由行把本地化标签传进去，因此不会引入第二份词表。

**通过 DOM 查询或 URL fragment 路由配置手势。** 两者既无类型也不可释放，也无法通过插件缝测试；Cordis 服务是被认可的跨插件通道，而且这里它能交出与外壳渲染相同的 store 实例。

**打开 设置 → 模型 但不指定提供方。** 卡片顺序会随用户配置提供方而变化，因此「定位到 BirdCoder 卡片」需要一个显式目标，而不是假定它在第一行。

## 后果

- Chat 的失败行获得两个具名座位，并保留全部文案：八种语言字典把句子承载为五个片段（前置、登录标签、之间、模型标签、后置），回退时这些标签作为纯文本渲染。
- `ctx.settingsMenu` 是可选服务。没有设置外壳的组合仍会挂载两个 IAM 座位；模型点击是惰性的，因为 `ctx.get('settingsMenu')` 解析为空，而且这种组合里本来也没有「模型」页可打开。
- 定位目标是临时 store 状态。从菜单重新打开设置或选择其他分区都不会重复滚动或高亮。
- IAM 包现在持有指向 `@deepseek-ai/dsh-client-ui-chat` 的 type-only `devDependency` 边，用于座位声明与其 owner props。

## 测试

- `ui-chat`：Chat 视图规格断言两个注册链接出现在句子对应位置、携带失败码与本地化标签，且无注册项时整句仍为纯文本；apply 规格固定两个子座位声明与该行无 inject face。
- `ui-sdkwork-iam`：组件规格覆盖两个链接的派发、登录短语在已登录时的降级、以及其他错误码下的惰性；样式规格断言链接使用主题的 `--dsw-alias-link` 别名、且只引用主题已声明的变量，保证浅色与深色主题下的呈现；apply 规格在真实 slot 注册表上注册两个座位，并断言登录派发与设置服务缺失时的配置路径。
- `ui-sdkwork-settings-menu`：根组件规格覆盖带定位目标的深链打开，以及手动导航与关闭时的清除；apply 规格断言服务驱动的 store 与注册暴露的是同一个。
- `ui-settings-models`：组件规格 stub `scrollIntoView`，断言指定的卡片被滚动并标记，未知路由不会标记页面。
