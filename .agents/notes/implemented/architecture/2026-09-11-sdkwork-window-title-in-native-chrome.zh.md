# Agent Note：非代码模式由宿主窗口命名，而不是页内横条

Status: implemented

[English](2026-09-11-sdkwork-window-title-in-native-chrome.md) | 中文

## 问题

[侧栏动作与模式页变更](2026-09-07-sdkwork-sidebar-actions-and-mode-pages.zh.md)给每个非代码模式配了一条通用页内横条：`AppFrame` 在键控 `mode.page` 分发之上渲染 `shell.app-header` 席位，`ui-sdkwork-common-app-header` 占用它，提供拖拽区域、模块标题、可选的 keyed 前置图标席位、尾部动作与窗口控制占位。

那条横条的前提是无边框桌面外壳——唯一的 chrome 是 `ui-sdkwork-window-controls` 的浮动按钮簇。实际交付的外壳是带边框的：窗口标题栏由 Electron 绘制，渲染进程的窗口控制面并不存在，于是页内横条成了叠在用户已有头部之下的第二个头部，还为一个从不渲染的按钮簇预留了 86–107px 的占位。

移除第二个头部有三条路：

- **只在桌面组成里隐藏它。** 席位由两种组成共用的 `ui-layout` 声明，横条仍需自己接一套“按模式可见”的接线，而 Web 组成会继续绘制桌面不再绘制的头部。
- **删掉包与席位。** 那么“模式到标题”的文案就没有归属。它无法搬进 `ui-layout`：那是 upstream 的包，而 fork 命名契约要求 fork 代码留在 `ui-sdkwork-*` 包里。
- **保留席位，改变它的职责。** 席位本就接收框架的生效模式，而这正是窗口标题投影所需；除 fork 已有的行之外，不增加任何 upstream 表面。

## 决策

非代码模式的模块标题由宿主窗口框架承载。

- **席位为 `shell.window-title`。** `ui-layout` 将其声明为 root 作用域的单例席位，owner 共享为当前模式加产品标题；`AppFrame` 在生效模式（`panelMode ?? mode`）不是 `code` 时把它渲染在键控 `mode.page` 分发之上。席位从 `shell.app-header` 改名，因为它不再绘制头部：没有拖拽区域、没有 keyed 前置图标、没有尾部动作、没有窗口控制占位。
- **占用方不渲染任何内容。** `ui-sdkwork-common-app-header` 的 `WindowTitle` 把 `document.title` 写成 `{模块} — {产品}`，并在卸载时还原为裸产品标题。在桌面上这是 Electron 由页面标题派生出的原生标题栏；在 Web 上是浏览器标签页。
- **代码模式保留自己的标题归属。** `AppFrame` 只在代码界面占据中列时挂载 `DocumentTitle`。两者从不同时挂载，因此切换模式会先卸载其一再跑另一者的 effect，二者不会争夺 `document.title`。此前两者都可能持有文档标题，而在每个模式页上都是会话标题胜出。
- **文案留在拥有它的特性里。** `appHeader` 字典（十四个模式名加 `mode-titles.ts` 名册）仍留在 fork 包中，而不是把 locale 依赖从 `ui-layout` 推进某个 fork 命名空间。
- **`AppModeId` 在使用处导入。** `ui-layout/src/client/index.ts` 重新导出了该类型，随后在其 owner 共享接口里使用它却没有导入。该包的 `noCheck` 构建把这条悬空引用从包程序中藏了起来，但 emit 出的声明带着它，于是模式栏与窗口标题 owner 共享的每个消费方都把模式解析成 error 类型。fork 如今用一个带类型的投影消费这些共享，缺陷就是这样浮现的。

## 验证

```sh
grep -rn "shell.app-header" packages apps                             # no in-page header seat remains
grep -c "shell.window-title" packages/client/ui-layout/lib/client.js  # 2: declaration + render site
npx vitest run packages/client/ui-layout packages/client/ui-sdkwork-common-app-header
```

逐文件覆盖率门禁覆盖 `ui-sdkwork-common-app-header/src/**`——浏览器投影与惰性的 host 入口，后者由插件规格测试钉住；`ui-layout/src/*` 仍留在客户端 GUI 债务豁免内。

## 考虑过的替代方案

- **保留横条、按组成隐藏。** 共享组成仍会绘制桌面外壳已提供的 chrome，两种组成还会逐渐分叉。
- **用 root hook 投影标题。** 新增 `GlobalStandardProps` 成员或 `ctx.layout` 可观测量能让投影无需席位就读到模式，但两者都会加宽每个客户端测试假件都要实现的契约，而席位本来就把模式作为 owner 参数带过来了。
- **让每个模式页自己做标题效果。** 各模式页投影各自标题让归属留在本地，但会把同一投影重复到各模式插件里，而且没有覆盖侧栏启动的覆盖层模块。

## 后果

- **窗口标题即页面内容。** 切到模块页会把原生标题栏改写为 `{模块} — {产品}`；在 Web 上则是浏览器标签页跟随。代码模式保留会话标题，因此两种投影不会争夺。
- **模式名册在构造上就是穷尽的。** `MODE_TITLE_KEYS` 是覆盖 `AppModeId` 联合的 `Record<WindowTitleMode, AppHeaderKey>`，因此新增模式 id 会让 fork 包的类型检查失败，直到名册与 `appHeader` 字典补上对应行——这是有意用构建期成本取代无类型的兜底标题。
- **横条的扩展点消失了。** 除横条自身外，keyed 前置图标席位与尾部动作区域没有占用者；但今后若有 fork 特性想在页内贡献模块动作，已无席位可占。
- **两种组成都失去横条。** Web 组成绘制的本是同一条头部，如今改为在标签页里显示模块名。无需任何按组成的可见性接线，这正是"改席位职责"而非"隐藏席位"的意义。
- **席位是对 upstream 文件的 fork 改动。** `ui-layout` 仍属 upstream，因此 upstream 对 shell 框架的改动可能与改名后的席位冲突；上面的 grep 就是合并时的检查。
- **新增模式页无需新代码。** `mode.page` 分发与各模式插件均未改动——标题只是一个席位的唯一占用方，由框架的生效模式驱动。
