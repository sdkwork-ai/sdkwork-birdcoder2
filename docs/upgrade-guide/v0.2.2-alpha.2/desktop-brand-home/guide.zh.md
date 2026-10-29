---
kind: upgrade-guide
description: "每个应用品牌拥有自己的 Harness home；BirdCoder 在首次打包启动时把 ~/.dsh 移动为 ~/.birdcoder，显式设置的 DSH_HOME 仍然优先。"
---
# 每个应用品牌拥有自己的 Harness home

[English](guide.md) | 中文

## 变更

桌面应用从打包进 `resources/brand.json` 的品牌清单解析数据根目录：出厂的 `brands/birdcoder.json` 指定 `~/.birdcoder`。启动器在任何插件挂载之前就把该目录导出为 `DSH_HOME`，因此 profile、会话、凭据、附件、工作区与 OEM profile 文件一起迁移。`~/.dsh` 不再与桌面应用共用。

首次打包启动会接管已存在的 `~/.dsh`：先重命名该目录（同盘移动，会话、凭据、profile 与工作区一并带走）；若因其他实例仍占用文件而无法重命名，则退化为创建目录联接；两者都失败时本次启动继续使用 `~/.dsh` 并报告该情况。未设置 `home.adoptLegacyDshHome` 的品牌清单永远不会读取 `~/.dsh`。

安装后的 CLI 启动脚本同样把 `DSH_HOME` 默认为该品牌 home，因此在终端与窗口中运行时读写同一批会话；显式设置的 `DSH_HOME` 在两者中都仍然优先。

两个已安装品牌不能共用的每一项身份现在都来自同一份清单：产品名（userData、单实例锁、日志）、URL scheme、桌面命令及其归属回执、Windows PATH 归属键与互斥体、更新缓存目录、产物命名。打包时选择 `DSH_BRAND=<key>` 产出的外壳可以与出厂版本并排安装、运行、更新与卸载。

npm `dsh` CLI 保持不变：它仍读取 `$DSH_HOME`，否则默认 `~/.dsh`，因为上游安装与本仓库共用该目录。

## 迁移

1. 桌面用户无需操作：下一次打包启动会把 `~/.dsh` 移动为 `~/.birdcoder`。请只启动一次新版本并确认数据已到位，不要再用旧版本开会话。
2. 如果要刻意共用一个 home——例如桌面应用与 npm `dsh` 共用同一批会话——请显式设置 `DSH_HOME`。启动器不会覆盖显式值，此时不会移动任何身份数据。
3. 如果希望保留 `~/.dsh` 原样——例如上游 `dsh` 仍会写入该目录——请在首次启动本版本之前为桌面应用设置独立的 `DSH_HOME`。只要设置了 `DSH_HOME`，旧 home 迁移就会被跳过。
4. 升级后确认连续性：`~/.birdcoder` 下存在 `sessions/`、`profiles/desktop/` 与 `.credentials.yaml`；`~/.dsh` 已消失或是指向它的联接。登录状态与已保存的 API Key 随迁移保留。
5. OEM 打包方在每一步打包中都选择 `DSH_BRAND=<key>`，随包提供 `resources/brand.json`，并且只对替代既有 `~/.dsh` 安装的品牌设置 `home.adoptLegacyDshHome`。完整字段、新品牌必须修改的身份值以及必须替换的构建期位图见 [brands/README.zh.md](../../../../brands/README.zh.md)。
