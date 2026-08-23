# Agent Note: SDKWork 客户端 bundle 中编译 Tailwind v4 源样式表

Status: implemented

[English](2026-08-23-compile-tailwind-source-sheets.md) | 中文

## 问题

桌面渲染进程通过 `app://dsh/` 提供每个 UI 插件的 `lib/client.js` bundle；web carrier 通过 HTTP 提供同样的 bundle。SDKWork 客户端 bundle 把组件 CSS 内联为注入的 `<style data-plugin-css>` 标签。`ui-sdkwork-appstore` 的 plain-CSS 内联器把 `sdkwork-appstore-pc-host/src/styles.css` 原样输出。该文件是 Tailwind v4 源样式表：开头是 `@import "tailwindcss";` 和 `@plugin "tailwindcss-animate";`，随后声明 `@theme` 值与自定义规则。浏览器会把注入的 style 标签中的裸 `@import "tailwindcss"` 按文档源解析，进而请求 `app://dsh/tailwindcss`（HTTP 模式下是 `/tailwindcss`），而任何 carrier 路由表都不提供该路径——渲染进程每次启动都会记录 `net::ERR_ABORTED 404`，该样式表自身的规则也从不生效。这与打包产物中 `app://dsh/tailwindcss/theme.css` 404 属于同一类故障，但路径不同：这里是包级 plain-CSS 内联器，而非预设的 global-inline 插件（[tailwind-css-entry-vs-global-inline-and-inspector-pack](../../implemented/process/2026-08-23-tailwind-css-entry-vs-global-inline-and-inspector-pack.zh.md)）。

## 决策

`packages/client/ui-sdkwork-appstore/tsdown.config.ts` 现在识别 Tailwind 源样式表（以 `@import "tailwindcss"` 或 `@plugin` 开头的文件），并走与 app `index.css` 相同的 `@tailwindcss/node` 管线进行编译：`compile` 配以包内安装的解析器、`Scanner` 扫描 SDKWork 源码根、`optimize`。不含 Tailwind 指令的普通 CSS 保持原有的原样内联路径。这与 sdkwork-appstore 的 Vite 应用行为一致——那里由 `@tailwindcss/vite` 编译每个被导入的 Tailwind 样式表；桌面 bundle 现在携带同样的编译产物。编译过的样式表会把自己的 scanner 文件与 glob 注册为 watch 依赖，因此 `--watch` 重建能保持最新。

bundle 测试固化了回归：`lib/client.js` 中不得以原文出现 `@import \"tailwindcss` 或 `@plugin \"tailwindcss`。

## 备选方案

**在 `readPlainCss` 中去掉 Tailwind 指令。** 不予采用，因为一旦样式表的 `@theme` 与工具类层与已编译的 `index.css` 发生分歧，它们就会在无人察觉的情况下不再生成；bundle 会丢失样式而不报错。

**因为 `index.css` 当前是其超集而直接丢弃该重复样式表。** 不予采用，因为那等于让 bundle 依赖两份文件永不分化；将来只加进 `styles.css` 的规则会被悄悄丢掉。

## 影响

appstore bundle 现在除编译后的 `index.css` 之外还携带编译后的 `styles.css` 输出（压缩后约 118 KB）；工具类重复与源 Vite 应用拼接出的结果一致。原始的 Tailwind 指令不再到达渲染进程，启动时的 404 随之消失。其余 SDKWork 客户端包（`ui-sdkwork-course`、`ui-sdkwork-drive`、`ui-sdkwork-iam`、`ui-sdkwork-knowledge`、`ui-sdkwork-token-plan`、`ui-sdkwork-generations-*`）共享同一份复制粘贴的 plain-CSS 内联器；它们当前的 checkout 都没有直接导入 Tailwind 源样式表，因此同样的隐患在模式被修复或抽入 `tsdown.client.ts` 之前仍可能在那里出现。
