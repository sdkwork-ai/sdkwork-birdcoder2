# Agent Note: 侧边栏与文件预览交互打磨

Status: implemented

[English](2026-09-09-sidebar-and-preview-interaction-polish.md) | 中文

## Problem

右侧边栏与文档预览周边的五个小交互缺陷。每个会话的停靠面出生时就播种默认页，于是用户从未打开过的折叠列里已经躺着一个页面，向全新停靠面的第一次打开会让种子页出现在所开内容旁边。页 tab 在整个停靠面范围去重：打开一个页时，若它的 tab 在另一格里，焦点会被拽到那一格，而不是在被要求的格里打开。把一个格的唯一 tab 拖到本格边缘什么都不发生，尽管用户明明要的是分栏。HTML 预览上方的下拉菜单在点击沙箱 iframe 内部时不消失，因为那次 pointerdown 根本到不了父文档。代码预览的复制条和卡片背景会被横向滚动甩开，而且代码保留了会话卡片的灰色填充，而不是坐在分栏自身的背景上。

## Decision

**默认页惰性播种。**[stores.ts](../../../../packages/client/ui-sidebar-right/src/client/stores.ts) 的 `createSurface` 铸造一个折叠且为空的停靠面；store 的 `advance` 只在意图让列保持展开时才把种子工厂传给 `planSettle`。首次会展示空布局的那次展开播种彼时的默认页；关闭最后一个可关 tab 时收起整列，布局保持为空直到下次展开。[最后一个 tab 的关闭规则](2026-09-08-sidebar-last-tab-close-rules.zh.md)与[默认页选择](2026-09-08-sidebar-default-pages.zh.md)维持原决定；默认页在展开时创建。对空分栏执行 split 不产生变化，不创建 tab，不记录历史，也不返回新分栏。

**页唯一性以格为界。**只对引导页的合并规则推广到每种页 kind（`pageKind`/`panePage`）：打开一个页只在这次打开的目标格内聚焦既有 tab；把页拖入、放入或收回到已展示该 kind 页的格会并入该格自己的 tab。资源 tab 保留套件的全停靠面聚焦。

**有工厂回填时，唯一 tab 可对本格分栏。**[planner.ts](../../../../packages/client/ui-dockkit/src/engine/planner.ts) 的 `planDropTab` 接受可选 `TabFactory`：带工厂时，先前被拒绝的本格边缘释放会分栏，工厂的 tab 先于移动回填腾出的格，因此被拖的 tab 最终保持聚焦。不带工厂时该释放仍不改变任何东西。

**焦点进入 iframe 时关闭菜单。**[Menu.tsx](../../../../packages/client/ui-primitives/src/Menu.tsx) 增加 window `blur` 监听，以 `document.activeElement instanceof HTMLIFrameElement` 为门：焦点移动是跨源 iframe 内 pointerdown 留下的唯一信号，这道门也让应用或标签页切换不会误关列表。

**代码预览钉住复制条并去掉卡片填充。**关闭折行时，[CodeBody.module.css](../../../../packages/client/ui-sidebar-documentpreview/src/client/code/CodeBody.module.css) 把渲染器设为 `max-content`，让吸附的复制条拥有完整滚动宽度可骑行，并以 `sticky; left: 0; width: 100cqw` 把它钉在文档滚动区上（预览正文设 `container-type: inline-size`）。共享 CodeBlock 的填充改经新变量 `--dsl-code-block-background`（默认值不变，会话保持灰色卡片），共享复制条带上惰性的 `data-code-block-banner` 钩子；预览把变量设为 `transparent`，代码于是坐在分栏自身的背景上。

## Alternatives considered

**保留出生即播种。**折叠列里躺着没人要的页面，且种子占据每个新停靠面的 0 号位，排在第一次真实打开之前。

**保留全停靠面的页去重。**显式"在这里打开"时焦点跳到另一格——正是引发这次改动的抱怨。

**菜单用裸的 window blur 关闭。**每次应用或标签页切换都会关掉列表；`activeElement` 门把关闭收窄到父文档看不见的那一种情形。

**代码横轴用内层滚动。**在 `pre` 上恢复 `overflow-x: auto` 能让复制条不动，但横向滚动条会落在整个代码块底部——长文件里够不着——而且两个轴本就有意放在文档 owner 的滚动区里。

## Consequences

`planDropTab` 的工厂参数是任何嵌入方都可传的新套件 API；`planSettle` 本就接受缺省工厂，如今它同时命名了侧边栏的折叠态行为。`--dsl-code-block-background` 变量与 `data-code-block-banner` 属性是代码块的 owner 定制接缝；共享样式表没有任何规则指向该属性。套件 planner 规格覆盖带回填的本格分栏及其聚焦顺序；侧边栏 store、service 与 seat 规格覆盖惰性播种、格内页合并与折叠后的空布局；一条 Menu 规格覆盖带门的 blur 关闭。`ui-sidebar-right`、`ui-dockkit` 与 `ui-sidebar-documentpreview` 的 README 重述了这些规则。
