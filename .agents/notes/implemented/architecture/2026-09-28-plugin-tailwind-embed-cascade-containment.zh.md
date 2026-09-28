# Agent Note: 将插件注入的 Tailwind 样式表限定在自有的级联层与作用域内

Status: implemented

[English](2026-09-28-plugin-tailwind-embed-cascade-containment.md) | 中文

## Problem

每个使用 Tailwind 的 fork 客户端产物，都会按各自的 `@source` 源码根编译一份自己的 `@layer utilities`，并在产物加载时以 `<style data-plugin-css>` 标签注入：`ui-sdkwork-apikey`、`ui-sdkwork-token-plan`、`ui-sdkwork-appstore`、`ui-sdkwork-markets`、`ui-sdkwork-knowledge`、`ui-sdkwork-course`、`ui-sdkwork-drive`、`ui-sdkwork-generations-assets`、`ui-sdkwork-generations-image`、`ui-sdkwork-generations-video`。这些样式表共享类名却不共享变体集合——十份都定义了 `.bg-white`，`ui-sdkwork-token-plan` 与三个应用层样式表到此为止，而只有 api-key 样式表另外定义了 `bg-slate-50`、`sm:w-72` 以及控制台视图调色板对应的 `dark:bg-*` 孪生规则。

同一级联层内由文档顺序决定胜负，因此最后注入的样式表占据了它恰好定义过的每一个类名。在深色宿主下的 API Key 管理弹窗里，这导致工具栏卡片、搜索框、表格主体、创建抽屉全为白底，主按钮文案换行（其他样式表的 `.w-full` 压过 `sm:w-auto`），错误横幅也停留在浅色——而表头与表尾保持正确的深色，因为 `bg-slate-50` 并未出现在其他样式表中。症状因此看起来像 `dark:` 变体失效，而不像跨产物类名冲突，并且它随产物加载顺序漂移，而非随弹窗漂移。

## Decision

api-key 嵌入内容的已编译 Tailwind 样式表在两个维度上被容器化，二者均由 `packages/client/ui-sdkwork-apikey` 拥有。

**级联层。** `tsdown.config.ts` 把编译结果包进 `@layer dsh-sdkwork-apikey-embed`。`apps/web/src/index.css` 以 `@layer properties, theme, base, components, utilities, dsh-sdkwork-embedded-app, dsh-sdkwork-apikey-embed;` 开头；层的位置由该层的首次声明决定，因此无论哪个产物最后加载，嵌入内容的规则都优先于 `utilities` 与 fork 共享的 `dsh-sdkwork-embedded-app` 层。

**作用域。** 在该层内部，样式表以两个 `@scope` 根输出：弹窗自身子树用 `[data-apikeys-embed]`，控制台视图 portal 到 `document.body` 的浮层（分组单元格浮层、分组选择器、快速导入菜单）用 `body[data-apikeys-embed-portal] to (#root)`。第二个根取的是 **body** 而非浮层本身，因为在 `@scope` 内部普通选择器无法命中自己的作用域根；`to (#root)` 限制使它不会波及弹窗所遮盖的应用本体。`ApiKeysModal.tsx` 在嵌入根写入 `data-apikeys-embed`，并在弹窗打开期间把 `data-apikeys-embed-portal` 写到 body 上。

`src/client/embedScope.ts` 是属性名、作用域、限制与层名的唯一定义处，组件与构建配置共同引用它，因此两侧不会漂移。

## Alternatives considered

**只提升优先级、不做容器化（仅用级联层）。** 它能修好嵌入内容，却会破坏其他所有界面：后置层里的 `.bg-white` 会压过更早层的 `dark:bg-*`，于是弹窗背后的应用层会继承同一个缺陷。

**只做容器化、不放到后置层（仅包 `@scope`）。** `@scope` 不增加优先级，因此在 `utilities` 层内部，嵌入内容的规则仍会输给后加载的样式表。级联层与作用域二者缺一不可。

**删掉 `apps/web/src/index.css` 中重复的 cloudrouter `@source` 行。** 宿主样式表携带同样的工具类，删除它可以少一个参与冲突的编译器——但运行时注入的样式表仍然排在宿主 `<link>` 之后，冲突依旧存在。它还会让 api-key 相关类在插件样式表缺席时失去兜底。

**用选择器前缀代替 `@scope` 做作用域限定。** 前缀方式可以用单个作用域命中 portal 出来的浮层根节点，且不需要限制条件，但需要用 CSS 解析器重写已编译的选择器，包括伪元素与 `@keyframes` 步骤。`@scope` 只需一层包裹，本仓库已有先例（`ui-sidebar-documentpreview` 的 Excel 预览），双根写法的代价只是多一份样式表。

**给 body 打标记但不加 `to (#root)` 限制。** 以 body 为根的作用域会在弹窗打开的整个期间重新美化遮罩背后的整个应用。

**对嵌入内容的工具类使用 `!important`。** 它能压过其他级联层，但也会压过嵌入内容内部 harness 自身的样式，且无法被拥有该规则的界面再次覆盖。

## Consequences

无论加载了哪些 fork 产物、顺序如何，嵌入内容在两种主题下的渲染都一致，且该样式表不再能影响两个作用域之外的任何界面。编译结果会输出两份，使一个已接近 2 MB 的产物再增加约 81 KB（压缩后仅数 KB，且两份文本完全相同）。

级联层顺序现在是由 `apps/web/src/index.css` 承载的契约。若某个宿主删掉那条声明，`dsh-sdkwork-apikey-embed` 的位置就退回到产物加载顺序，也就是本记录要消除的缺陷。

样式表在 `:root` 上声明的主题自定义属性位于两个作用域根之外，因而是无效的；宿主样式表声明了同样的 Tailwind 主题，且 `apps/web/src/index.css` 为两份样式表都把 `primary-*` 与 `lobster-*` 色阶重新映射到 harness 令牌。

其余九份样式表之间的冲突依然存在，`ui-sdkwork-token-plan` 那份未加包裹、且基于 class 的 dark 变体是最明显的一例；把它们也容器化是同一改动按包逐个施加，不属于本次决策。

## Testing

`packages/client/ui-sdkwork-apikey/tests/modal.client.spec.tsx` 固定了嵌入属性、就绪取值，以及打开、关闭、卸载三种状态下 body 标记的存续。渲染本身已在 Chromium 中针对构建产物 `lib/client.js` 与构建出的宿主样式表验证，并在其后注入 token-plan、appstore、markets、knowledge 四份样式表：工具栏 `#252525`、搜索框 `#1e1e1e`、表头与表格主体为深色、抽屉 `#1e1e1e`、portal 菜单 `#1e1e1e`、主按钮 `108x38` 不换行，且在浅色模式下全部为浅色。同一文档清除 body 标记后，portal 菜单失去该样式表，而 `#root` 内的元素始终不会获得它。
