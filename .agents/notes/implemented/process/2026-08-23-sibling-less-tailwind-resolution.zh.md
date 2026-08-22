# Agent Note：Tailwind 解析不能依赖 sibling 的 node_modules

Status: implemented

[English](2026-08-23-sibling-less-tailwind-resolution.md) | 中文

## 问题

`Release (dsh)` 在 `build:lib:client` 阶段因 `[plugin dsh-appstore-tailwind-css] Can't resolve 'tailwindcss'` 失败。Tailwind 编译插件处理的样式表位于 sibling SDKWork checkout（`../sdkwork-*`）中。本地开发正常是因为 sibling 自带各自的安装；但发布 runner 通过 `setup-sdkwork-siblings` 克隆钉住的 sibling 时不带 `node_modules`，`@tailwindcss/node` 从样式表目录出发的默认解析因此失败。

## 决策

Tailwind 编译插件通过 `packages/client/tsdown.client.ts` 中共享的 `tailwindResolvers(import.meta.url)` helper 传入 `customCssResolver` 与 `customJsResolver`。resolver 从声明包自身的安装加载 bare 模块（每个声明包把编译所需的 Tailwind 运行时与插件列为 devDependencies），对包未安装的 id 回退到默认解析。`ui-sdkwork-appstore` 额外声明 `tailwindcss-animate`，因为其样式表使用了 `@plugin "tailwindcss-animate"`。

样式表侧通过 `style` 字段（`tailwindcss/index.css`）加载裸 `tailwindcss` id；JavaScript 侧解析模块入口。

## 后果

Client 阶段在有无 sibling `node_modules` 时构建结果一致：本地 checkout 与发布 runner 产出相同的 bundle。sibling 源码中未解析的 bare import（仅 runner 上由 rolldown 报告为警告）不改变产物的外部依赖。

## 测试

本地模拟发布 runner（隐藏 sibling 根 `node_modules`）：Client tsdown 阶段完成。恢复 sibling 后同一阶段零警告完成。
