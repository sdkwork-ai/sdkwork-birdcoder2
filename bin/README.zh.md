# bin/ — 标准化入口（`sdkwork-specs/MODULE_BIN_SPEC.md`）

[English](README.md) | 中文

`sdkwork-birdcoder2` 交付标准的九个 `bin/` 入口脚本。共享行为位于
`sdkwork-specs/bin/lib/sdkwork-common.sh`；本目录只承载身份标识
（`bin/lib/module.sh`）与薄封装的分发逻辑。

| 脚本 | 用途 |
| --- | --- |
| `docker-image.sh` | 构建 / 推送 / 保存 / 加载 / 更新 / 检查 `registry.sdkwork.com/apps/sdkwork-birdcoder2-standalone:<version>` |
| `docker-deploy.sh` | 在 `wsl` 或 `ssh://[user@]host` 上对 Docker bundle 执行 install / upgrade / rollback / status / logs / down / start / stop / restart |
| `apps-build.sh` | 构建已声明的 app surface（默认：`server` → cargo） |
| `apps-package.sh` | 把各 surface 打包到 `target/bin-packages/`（附带 sidecar `.sha256`） |
| `apps-deploy.sh` | 把打包产物部署到 WSL Ubuntu / 远程 Ubuntu |
| `apps-pkg-installer.sh` | 制作原生 OS 安装包（`windows|linux|macos|android|ios`），输出到 `target/bin-installers/` |
| `config.sh` / `doctor.sh` / `backup.sh` | 运维生命周期（`OPERATIONS_SPEC.md` §3–§5） |

已声明的 app 类型：`server,desktop`。默认镜像标签来自
`sdkwork.app.config.json` → `release.currentVersion`。

标志：`--environment development|test|staging|demo|production` ·
`--profile standalone|cloud` · `--host wsl|ssh://[user@]host[:port]` ·
`--yes` · `--dry-run`。每次运行都会把命令、标志与退出状态追加到
`target/bin-evidence/evidence.log`。环境自检请运行 `bin/<script>.sh doctor`。

> `bin/lib/module.sh` 中标记为 "no canonical command wired yet" 的钩子会快速失败并给出指引；
> 待仓库规范的构建/打包/部署命令落地后，把它们接线过去（MODULE_BIN_SPEC.md §3）。
