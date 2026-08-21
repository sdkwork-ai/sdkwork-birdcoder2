# Agent Note: 从安装路径加载容器原生 Loader 辅助组件

Status: implemented

[English](2026-08-15-noexec-container-native-loader.md) | 中文

## 问题

随附的 Compose 运行时使用只读根文件系统以及采用 `noexec` 挂载的内存 `/tmp`。Cordis Loader 的可选 `node-addon-require-builtin` 辅助组件通常会先将原生 addon 复制到临时目录再加载。Linux 拒绝从 `noexec` 挂载映射该副本，Loader 会在没有 Node 内部模块 loader 的情况下继续运行，随后 CLI 用于配置监听的 HMR 服务会失败，并给出要求 `--expose-internals` 的误导性诊断。普通 `docker run` 冒烟测试不会复现 Compose 的安全设置。

## 决策

运行时镜像设置 `NARB_DISABLE_NATIVE_CACHE=1`，使辅助组件直接从 `/opt/dsh` 下不可变的 npm 安装中加载与架构匹配的 addon。Compose 继续使用只读根文件系统和 `noexec` 临时挂载。Kubernetes 继续使用只读根和内存 `emptyDir`；核心 `emptyDir` API 没有 mount option 字段，因此其 tmpfs 不承诺 `noexec`。源码构建和已保存镜像部署使用相同的直接加载设置，不依赖可执行临时存储。[从打包产物构造容器发布](../process/2026-08-15-container-release-from-packed-artifacts.zh.md)负责已安装运行时布局，本决策负责其加固 Compose 配置所需的原生加载设置。

容器发布工作流会重新加载已保存镜像并启动打包后的 Compose 文件，而不是启动普通容器。冒烟测试会等待健康状态、请求 `127.0.0.1:4080`、在 `/data` 与 `/workspace` 下写入标记、重建服务容器并要求两个标记仍然存在。静态容器校验固定原生缓存设置以及打包后 Compose 的冒烟测试。

## 曾考虑的替代方案

**允许在 Compose `/tmp` 执行文件。** 不采用，因为辅助组件已经包含已安装的原生 addon，而移除 `noexec` 会在没有应用需求的情况下削弱容器内每个进程的限制。

**使用 `--expose-internals` 启动 Node。** 不采用，因为这会向整个应用暴露不受支持的 Node 实现接口，并且容器入口会把额外参数转发给 Web 命令，而不是 Node 的 `execArgv`。

**移除仅用于配置监听的 HMR 服务。** 不将其作为容器修复，因为实时 profile patch 监听是应用约定，而且 Loader 仍使用原生辅助组件解析已安装的裸插件 specifier。监听器实现可以独立演进，无需临时目录具备执行权限。

## 后果

镜像依赖辅助组件提供的 `NARB_DISABLE_NATIVE_CACHE` 开关，并将原生代码保留在已安装包目录中。作为收益，加固后的 Compose 无需可执行临时存储即可启动，Kubernetes 不依赖其临时挂载可执行，发布校验也会覆盖操作者实际使用的打包部署、端口、健康检查和命名卷容器重建路径。
