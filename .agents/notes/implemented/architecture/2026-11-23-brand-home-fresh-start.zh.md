# Agent Note: 品牌 home 从空目录开始，且不再触碰 `~/.dsh`

Status: implemented

[English](2026-11-23-brand-home-fresh-start.md) | 中文

## Problem

打包后的桌面应用采用“接管”的方式继承首次启动用户的数据：把 `~/.dsh` 重命名为 `~/.birdcoder`，重命名被拒时改为在两个目录之间创建目录联接。这两种操作都把 DeepSeek Harness 的 home 交给了另一个产品：重命名之后，已安装的上游应用与 npm `dsh` CLI 解析出的 `~/.dsh` 已不存在，只能从空目录重新开始；建立联接之后，它们会写入品牌 home，并以自己的名义读取 BirdCoder 的会话。重命名失败时继续使用 `~/.dsh`，则让两个产品共用一个目录——应用报告了该状态，然后就这样运行下去。无论接管能为既有用户带来多少连续性，安装第二个产品都不应移动、藏匿或写入另一个产品的数据。

## Decision

`apps/desktop/src/brand.ts` 从 `resources/brand.json` 解析出 `~/.<home.dirName>`，目录不存在时新建它，并导出为 `DSH_HOME`；显式 `DSH_HOME` 仍然优先且不被改动。接管逻辑已删除：启动器不再读取、重命名、联接或写入 `~/.dsh`，因此品牌 home 从空目录开始，只保存本品牌创建的内容。`home.adoptLegacyDshHome` 已从清单 schema 中移除；仍带该键的清单照常解析，但该键不起作用。npm `dsh` CLI 继续通过 `@deepseek-ai/dsh-home-paths` 解析 `~/.dsh`，因此已安装的 Harness 与本品牌各自拥有互不相交的 home。

本条部分取代 [OEM 品牌拥有自己的 home 与应用身份](2026-10-29-oem-brand-home-and-identity.zh.md)中的接管机制；它确立的品牌身份清单归属与 `DSH_HOME` 机制仍然有效。面向用户的变更记录见[升级指南](../../../../docs/upgrade-guide/v0.2.3-alpha.2/brand-home-fresh-start/guide.zh.md)。

## Alternatives considered

**把 `~/.dsh` 复制进新建的品牌 home。** 否决：那些凭据、会话与工作区属于另一个产品的 home。复制会把它的登录状态导入进来、让附件占用翻倍，并留下同一段历史的两个分叉副本。需要连续性的用户按升级指南的说明，自行把条目复制进 `~/.birdcoder`。

**保留重命名，只改进提示。** 否决：重命名本身就是破坏——在另一个产品看来，它的 home 从此不存在——任何提示都无法修复。

**保留清单开关，供“替代既有安装”的品牌使用。** 否决：该开关记录的是打包方意图中的身份，而不是启动时 `~/.dsh` 在机器上的所有者。品牌无法知道该目录当前的所有者是否仍然安装着，因此配置无法让这种接管变得安全。

**用联接代替重命名，让两个名字都有效。** 否决：联接让两个产品写同一个目录，各自的会话与凭据会以对方的名义出现。

## Consequences

升级后的首次启动从空 home 开始：用户需要重新登录，写在 `~/.dsh` 下的会话不会出现在品牌列表中。数据已在 `~/.birdcoder` 的安装照常继续。早期重命名失败的 BirdCoder 版本把数据留在了 `~/.dsh` 里，升级指南用复制的方式迁移。

DeepSeek Harness 的数据现在能经受每一次 BirdCoder 启动、更新与卸载，两个产品可以在操作系统的同一个用户 profile 上并行运行，而互不解析对方的 home。`apps/desktop/tests/brand-home.spec.ts` 固定了四种结果：显式 `DSH_HOME` 被保留；缺失的品牌 home 以空目录新建，同时已有 `~/.dsh` 的内容保持不变；已存在的品牌 home 被原样复用；创建失败时报告该情况，启动仍导出品牌 home。
