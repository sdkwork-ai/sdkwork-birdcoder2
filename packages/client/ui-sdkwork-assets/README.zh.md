# @deepseek-ai/dsh-client-ui-sdkwork-assets

[English](README.md) | 中文

资产应用模式，作为独立模块提供：它自己的模式栏条目与中心列页面。模式栏外壳（ui-sdkwork-app-modes）按模式 id 渲染 keyed 的 `mode.rail.entry` 席位，并把实时选中状态交给每个条目；本包把 `assets` 条目——字形、文案与外观——以及 `assets` 占位页注册进框架的 keyed `mode.page` 槽。模式 id 加入 ui-layout 的 `AppModeId` 词汇；切换到它时渲染本页，直到真实的资产表面在同一个 keyed 席位后落地。

字形是本包自包含的两档图标——空闲条目与页面使用描边版，模式栏选中条目使用实心版——遵循共享图标契约。

## 模型体验

无，因为本包只是人类使用的表面 chrome；切换模式只改变浏览器视图状态，这里没有任何内容到达模型请求。

#### KV Cache effect

无；本包既不组装也不发送 provider 请求。

## 已知限制与暂缓事项

- **占位页** —— 资产表面目前是"建设中"提示，位于同一个 keyed `mode.page` 席位；真实功能属于本模块的未来工作。
