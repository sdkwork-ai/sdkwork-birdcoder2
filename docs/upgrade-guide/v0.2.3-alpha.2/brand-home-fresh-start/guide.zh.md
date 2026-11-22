---
kind: upgrade-guide
description: "打包后的桌面应用改为新建空的 ~/.birdcoder，不再把 ~/.dsh 重命名成它；home.adoptLegacyDshHome 已不存在。"
---
# 桌面应用从空的品牌 home 启动，不再接管 `~/.dsh`

[English](guide.md) | 中文

## 变更

过去，打包后的首次启动会把已存在的 `~/.dsh` 重命名为 `~/.birdcoder`（同盘移动，会话、凭据、profile 与工作区一并带走），无法重命名时改为创建目录联接；品牌清单里的 `home.adoptLegacyDshHome` 决定该品牌是否参与这次接管。

现在启动器只从 `resources/brand.json` 解析 `~/.<home.dirName>`，在目录不存在时新建它，并导出为 `DSH_HOME`。它不再读取、重命名、联接或写入 `~/.dsh`，因此已安装的 DeepSeek Harness 与 npm `dsh` CLI 保留它们各自的会话、凭据与工作区。清单里仍带 `home.adoptLegacyDshHome` 时照常解析，该键被忽略。

有两种情况需要区分。数据已经在 `~/.birdcoder` 的安装继续使用它。曾因重命名失败而继续使用 `~/.dsh` 的 BirdCoder 版本（启动时会报告实际使用的 home）现在从空目录开始：它写入的会话仍在 `~/.dsh` 里，与 DeepSeek Harness 的数据并存，由下文第 2 步迁出。

## 迁移

1. 如果 `~/.birdcoder` 已保存本安装的数据，或该机器上从未运行过 BirdCoder，则无需操作：下次启动使用 `~/.birdcoder`，`~/.dsh` 保持原样。
2. 需要把数据从 `~/.dsh` 迁出时，先退出 BirdCoder 与所有 `dsh` 进程，再把需要的条目（`sessions/`、`profiles/`、`.credentials.yaml` 以及你依赖的其他顶层条目）复制进 `~/.birdcoder`，并保留 `~/.dsh` 原目录。macOS 与 Linux：`mkdir -p ~/.birdcoder && cp -a ~/.dsh/. ~/.birdcoder/`。Windows PowerShell：`New-Item -ItemType Directory -Force "$env:USERPROFILE\.birdcoder"; Copy-Item -Recurse "$env:USERPROFILE\.dsh\*" "$env:USERPROFILE\.birdcoder"`。
3. 需要有意识地共用一个 home 时，在启动前设置 `DSH_HOME`；启动器不会覆盖显式值。
4. 从你维护的每个 `brands/<key>.json` 中删除 `home.adoptLegacyDshHome`，它已不起作用。
5. 升级后确认：应用列出了预期的会话并记住登录状态，且 `~/.dsh` 仍保有升级前的 DeepSeek Harness 数据。
