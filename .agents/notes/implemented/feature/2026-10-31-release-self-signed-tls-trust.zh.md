# Agent Note：发布包对自签名 HTTPS 证书的信任

Status: implemented

[English](2026-10-31-release-self-signed-tls-trust.md) | 中文

## 问题

桌面外壳通过两条互相独立的网络栈访问 SDKWork 网关：Chromium 承载渲染进程、内嵌产品页面与 updater 的 `net` 请求，Node 承载外壳自身的请求，以及 dsh Host 和它启动的每个 Node 子进程。网关使用自签名证书的部署在两侧都会失败——Chromium 报 `net::ERR_CERT_AUTHORITY_INVALID`，Node 报 `DEPTH_ZERO_SELF_SIGNED_CERT`——而安装后的应用没有受支持的方式改变这一点。源码态的 [`desktop:prod --insecure-tls`](../../../../apps/desktop/README.zh.md#develop) 通道可以在调试启动中接受该证书，但它把 Chromium 开关放在未打包 Electron 二进制的命令行上；双击启动的发布包没有这样的位置，而把证书导入操作系统受信任根又需要部署方无法假定的管理员权限。

## 决策

### 一次解析，覆盖两条网络栈

`apps/desktop/src/tls-trust.ts` 从三个显式输入解析决定，优先级由高到低：`--insecure-tls` 参数、`DSH_DESKTOP_INSECURE_TLS=1`、打包清单字段 `dshDesktopInsecureTls`。参数与环境变量各自只对一次启动生效；清单字段对该构建的每次启动生效。无法识别的环境变量值会抛错，而清单值不是布尔 `true` 时保持验证开启：解析发生在 `ready` 之前，此时抛错会让进程在没有致命报告的情况下退出。

启用后，`main.ts` 在模块加载期、`app.whenReady()` 之前应用决定：向 Chromium 命令行追加 `--ignore-certificate-errors`，并在进程环境中设置 `NODE_TLS_REJECT_UNAUTHORIZED=0`。因此 Chromium 在渲染进程、内嵌页面、webview 访客与 updater 的 `net` 请求中接受该证书；Node 在全局 `fetch`、undici 与 `https` 中接受它。macOS 读取登录 shell 会替换 Host 的环境，因此 Host 启动处重新应用该变量，Host 及其启动的 Node 子进程都会继承它。开发通道复用同一个开关常量与环境组合，两条通道接受的证书完全一致。

### 构建携带默认值

在打包环境或平台 dotenv 中设置 `DSH_DESKTOP_INSECURE_TLS=1`，`electron-builder-config.mjs` 会把 `dshDesktopInsecureTls: true` 写入 `extraMetadata`，并合并进打包后的 `app.asar/package.json`。启动在第一个窗口打开前读取该字段，因此为该部署构建的安装包每次启动都接受其网关证书。省略该设置的通道（包括所有正式发布的通道）打包出的都是验证开启。[打包配置](../../../../apps/desktop/packaging/README.zh.md#configuration-and-local-builds)在同一平台的其它字段旁记录该设置。

### 打包共用同一份信任

同一设置也让打包过程访问自签名主机。`package-target.ts` 把 `NODE_TLS_REJECT_UNAUTHORIZED=0` 导出到每个阶段的执行环境——通过 pnpm 安装运行时、electron-builder 下载 Electron 发行包与资源、每个准备步骤——以及自身的版本发现与 bucket 请求。它还会把该决定记录到本次运行的 `run.json` 的 `insecureTls` 字段，保留的构建记录因此能说明其下载是否接受了无法验证的证书。一次选择即可覆盖 registry、镜像或网关使用自签名证书的构建，不需要第二个开关。

## 考虑过的替代方案

**改为信任配置的 CA 文件。** `NODE_EXTRA_CA_CERTS` 覆盖 Node，但 Chromium 只认操作系统受信任根，因此内置 CA 需要在每个 session 上实现会验证证书链的 `setCertificateVerifyProc`——等于再维护一套证书验证器及其失败模式。安全方式改为继续与这个开关并列记录在文档里。

**所有发布包都接受任意证书。** 这样不需要构建开关，也不需要运维动作。但它会为所有网关证书本就有效的部署关闭验证，把一处本地配置失误变成静默的中间人通道；因此除非构建显式选择退出，验证保持开启。

**只在主进程处理 `certificate-error`。** 面向 web contents 的处理器覆盖渲染进程导航，却不覆盖主进程自身的 `net` 与 Node 请求，最终还是需要同一个 Node 变量；统一用一个开关，两条栈与两条通道才能完全一致。

**只依赖操作系统受信任根。** 这是安全答案，也已写入文档，但需要在安装机器上取得管理员权限，无法由部署方随发布包一起携带。

## 后果

选择该设置的构建会对它发出的每个 HTTPS 请求接受 Chromium 与 Node 无法验证的证书——网关、更新源、Host 的模型流量与内嵌页面——而不只是触发它的那个端点。启动会打印一行警告，指明启用它的输入；安全方式（正确签发的证书、操作系统受信任根、`NODE_EXTRA_CA_CERTS`）继续作为替代方案记录在文档中。启用它的打包也会为下载接受同类证书，因此这份信任决定同时覆盖构建输入与安装后的应用。

## 验证

`pnpm exec vitest run apps/desktop/tests/tls-trust.spec.ts apps/desktop/tests/packaged-tls-trust.spec.ts apps/desktop/tests/package-target-stages.spec.ts apps/desktop/tests/main-startup.spec.ts apps/desktop/tests/online-debug-launch.spec.ts` 覆盖三个输入的优先级与校验、Chromium 开关与 Node 变量、登录 shell 读取之后的 Host 环境、打包元数据，以及每个打包阶段的执行环境。Node 侧变量正是开发通道文档中针对全局 `fetch`、undici 与 `node:https` 验证过的那个；Chromium 开关也是该通道一直在启动时传入的同一个。
