# Agent Note: 客户端Bundle将动态导入内联进单一产物

Status: implemented

[English](2026-09-10-client-bundle-inline-dynamic-imports.md) | 中文

## 问题

客户端Bundle是单一闭包工厂产物：启动图每个插件行只下发一个脚本，模块表的 require 只应答包名说明符（平台种子字、图行、已注册工厂）。Rolldown 仍会把动态 `import()` 拆分到同级chunk，因此探索器的 Monaco 引导（`monacoSetup.ts`，随"已应用变更的diff标签页"一起交付）在 `lib/client.js` 旁边产出了 `editor.api-<hash>.cjs`，并把导入降级为 `require("./editor.api-<hash>.cjs")`。物化时加载器 require 落空——这些chunk是没有任何图行拥有的相对路径，也不在包的 `files` 清单里——于是每个 Monaco 标签页都以 "missed the module table" 失败。没有任何门禁捕获它：bundle纯度门检查的是模块边，不是产出的文件数量。

## 决策

共享客户端预设（`packages/client/tsdown.client.ts`）为每个插件客户端Bundle设置 `outputOptions.codeSplitting: false`，把动态导入的模块内联进 `lib/client.js`；rolldown 将 `import()` 降级为内部的惰性初始化，不再产生 require 调用。`scripts/client-bundle-purity.spec.ts` 中的一条规范钉住单一产物的输出选项。apikey 嵌入保留其对裸 `monaco-editor` 的刻意外部化：外部的动态导入仍是模块表会拒绝的 require，由同级编辑器的降级只读回退捕获，行为不变。

## 已考虑的替代方案

**按插件行下发并注册这些chunk。** 否决：模块表是按包名键控的平面结构，让它应答相对chunk路径意味着每个插件的子图、第二条下发路径，以及针对 `files` 清单并不发布之产物的 HMR 失效——全为保住一次惰性下载。

**像 apikey 那样外部化 Monaco，降级到回退查看器。** 否决：探索器的文件与diff标签页正是这个内核存在的意义；降级的纯文本视图是嵌入场景的折衷，不是探索器的。

**禁止客户端源码使用动态导入。** 否决：惰性单例模式是合法的源码结构；本契约禁止的是拆分产物，不是语法。

## 后果

每个插件客户端Bundle物化时都不再含有相对 require，添加动态导入的插件Bundle保持可加载，而不是多出一个运行时抛错。Monaco 随探索器的 `lib/client.js` 一起下发，探索器行在下载Bundle时即取得内核，而不是等到第一个编辑器标签页——与其余所有被内联依赖一致的急切形态，惰性仍保留在物化层。对没有动态导入的Bundle，`codeSplitting: false` 是无操作；其余客户端包均未产出过同级chunk。`ui-sdkwork-explorer/lib/` 下的陈旧chunk残留已删除。覆盖：预设规范钉住 `entryFileNames: 'client.js'` 与 `codeSplitting: false`；trajectory 产物规范物化重建后的Bundle；重建后的探索器Bundle不含 `require("./…")` 调用。相关：[探索器的已应用变更diff标签页](../feature/2026-09-09-sdkwork-explorer-applied-change-diff-tab.zh.md)，其 Monaco 引导暴露了这一缺口。
