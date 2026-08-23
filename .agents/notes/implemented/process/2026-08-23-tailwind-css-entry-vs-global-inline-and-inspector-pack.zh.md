# Agent Note：Tailwind CSS 入口必须抢先于 preset 全局内联插件；发布打包新增 --inspect

Status: implemented

[English](2026-08-23-tailwind-css-entry-vs-global-inline-and-inspector-pack.md) | 中文

## 问题

打包后的渲染器请求 `app://dsh/tailwindcss/theme.css` 得到 404，界面启动即空白。`tokenPlan.css`（`ui-sdkwork-token-plan` 内的 Tailwind v4 入口）保留 `@import "tailwindcss/theme.css" layer(theme)` 与 `@import "tailwindcss/utilities.css" layer(utilities)`，应由包自身的 Tailwind 编译插件内联。Client tsdown pass 中 preset 的 `dsh-css-global-inline` 插件先于包插件执行（preset 插件被展开在前面），把 `./tokenPlan.css` 当作普通全局样式表拦截，原样输出——裸 `@import` 与 `@source` 规则一并保留，运行时便请求这些不存在的路由。sibling 持有的 Tailwind 入口不受影响，因为 `isInImporterPackageSources` 拒绝声明包之外的样式表。

`release:gitdependencylocal` 之前也只把文件复制回工作区：`win-unpacked` 目录（boot probe 的验证对象）从不刷新，可能出现用旧树验证新构建的情况。

## 决策

- `ui-sdkwork-token-plan` 把 browser-builtins、qrcode、Tailwind、普通 CSS 插件移到 `config.plugins` 之前，让 `tokenPlan.css` 先到达 Tailwind 编译器。`physicalCssPath` 改为按文件名匹配（`endsWith('tokenPlan.css')`）而非仅绝对形式 `/tokenPlan.css`，因为页面以 `./tokenPlan.css` 导入。
- `release:gitdependencylocal` 支持 `--inspect [port]`（默认 9229）：端口经 `DSH_PACKED_INSPECT` 传给 desktop tsdown 配置，`apps/desktop/tsdown.config.ts` 将其转为 define——打包产物中是字面量端口，默认不传时是 `''`（relaunch 代码被 tree-shake）。`main.ts` 在存在注入端口且启动参数尚无 `--inspect` 时自动带 `--inspect=<port>` 重启一次，因为 V8 inspector 只认启动参数（实测 `app.commandLine.appendSwitch` 对主进程无效）。
- 产物复制先清空 `apps/desktop/release-build` 再递归复制目录，确保 `win-unpacked` 总是本次构建。

## 影响

其它包的 Tailwind 入口都在 sibling checkout 中，从不经过 `dsh-css-global-inline`；只有包内入口需要调整顺序。不带 `--inspect` 的打包产物完全不含 inspector 代码（已通过产物检查确认）。调试打包应用时，自动重启一次后连接 `127.0.0.1:9229`。

## 测试

`packaged-boot-probe` 对相对路径与 git 依赖两种包均通过；带 `--inspect` 的打包 exe 实测监听 9229 且 `GET /json/list` 返回 `node.js instance`。
