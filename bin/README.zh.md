# bin/ — 标准化入口（`sdkwork-specs/MODULE_BIN_SPEC.md`）

[English](README.md) | 中文

`sdkwork-birdcoder2` 交付标准的九个 `bin/` 入口脚本。共享行为位于
`sdkwork-specs/bin/lib/sdkwork-common.sh`；本目录只承载身份标识
（`bin/lib/module.sh`）与薄封装的分发逻辑。

| 脚本 | 用途 |
| --- | --- |
| `docker-image.sh` | 构建 / 推送 / 保存 / 加载 / 更新 / 检查 `registry.sdkwork.com/apps/sdkwork-birdcoder2-standalone:<version>` |
| `docker-deploy.sh` | 在 `wsl` 或 `ssh://[user@]host` 上对 Docker bundle 执行 install / upgrade / rollback / status / logs / down / start / stop / restart |
| `apps-build.sh` | 构建已声明的 app surface（`server` → cargo · `h5`/`pc` → 根 `build:<arch>:<env>[:cloud]` · `desktop` → `build:desktop`） |
| `apps-package.sh` | 把各 surface 打包到 `target/bin-packages/`（附带 sidecar `.sha256`） |
| `apps-deploy.sh` | 把打包产物部署到 WSL Ubuntu / 远程 Ubuntu |
| `apps-pkg-installer.sh` | 制作原生 OS 安装包（`windows|linux|macos|android|ios`），输出到 `target/bin-installers/` |
| `config.sh` / `doctor.sh` / `backup.sh` | 运维生命周期（`OPERATIONS_SPEC.md` §3–§5） |

已声明的 app 类型：`server,desktop,h5,pc,flutter,mini-program` —— 即 Rust
API 装配工作区、Electron 外壳，以及 `apps/` 下的四个 SDKWork 客户端应用根
（`sdkwork-birdcoder2-h5`、`-pc`、`-flutter-mobile`、`-mini-program`）。
默认镜像标签来自 `sdkwork.app.config.json` → `release.currentVersion`。

标志：`--environment development|test|staging|demo|production` ·
`--profile standalone|cloud` · `--host wsl|ssh://[user@]host[:port]` ·
`--yes` · `--dry-run`。每次运行都会把命令、标志与退出状态追加到
`target/bin-evidence/evidence.log`。环境自检请运行 `bin/<script>.sh doctor`。

> `bin/lib/module.sh` 中已接线的部分：`apps-build.sh` 的
> `server`/`h5`/`pc`/`desktop`。仍未接线的钩子——`docker-image.sh build`、
> `apps-build.sh flutter|mini-program`，以及整条
> package/installer/deploy 通道——会快速失败并给出需要接线的确切命令
> （MODULE_BIN_SPEC.md §3）；待仓库规范的构建/打包/部署命令落地后接线过去。
