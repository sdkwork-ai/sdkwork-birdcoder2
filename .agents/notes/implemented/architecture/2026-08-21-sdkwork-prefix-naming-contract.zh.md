# Agent Note: SDKWork fork 命名契约（sdkwork 前缀）

Status: implemented

[English](2026-08-21-sdkwork-prefix-naming-contract.md) | 中文

## 问题

本 fork 在 `deepseek-ai/deepseek-harness` 之上定制与新增包，而上游持续迭代。契约确立之前，fork 专属包使用普通名称（`ui-iam`、`ui-env`、`desktop-carrier`），上游可能采纳或与之撞名。一次上游合并就可能静默覆盖 fork 功能，或名称冲突迫使 fork 包被当作上游包处理。2026-08-21 的上游同步让代价变得具体：没有区分性标记的 fork 包，在冲突解决时无法与上游包区分。

## 决策

本 fork 新增或定制的每个包/入口，其名称中都带 `sdkwork` 标记，紧跟命名其表面的作用域词之后：

| 表面 | npm 名称 | 目录 | 示例 |
|---|---|---|---|
| 客户端 UI 包 | `@deepseek-ai/dsh-client-ui-sdkwork-<name>` | `packages/client/ui-sdkwork-<name>/` | `ui-sdkwork-iam`、`ui-sdkwork-env` |
| Host 包 | `@deepseek-ai/dsh-sdkwork-<name>` | `packages/host/sdkwork-<name>/` | `sdkwork-desktop-carrier` |
| Bundle 包 | `@deepseek-ai/dsh-sdkwork-<name>` | `packages/bundle/sdkwork-<name>/` | `sdkwork-desktop-app` |
| Boot 包 | `@deepseek-ai/dsh-sdkwork-<name>` | `packages/boot/sdkwork-<name>/` | `sdkwork-env-bootstrap` |

普通 `ui-<name>`／`<name>` 包名属于上游。fork 代码绝不驻留在其中；发现仍用普通名称的 fork 包即为重命名债务项，记录在本台账中直到重命名落地。

导入、tsconfig paths、cordis.yml 行、文档、测试以及所有其他引用一律使用 `sdkwork` 名称——不留别名、兼容包或双名（[仓库命名契约](2026-08-11-repository-naming-contract-and-rename-ledger.zh.md)适用同样的全有或全无规则）。

## 重命名台账

已在 WIP 分支 `wip/sdkwork-sync-2026-08-21` 完成（2026-08-21 检查点，待最终审查与合入 `main`）：

- `ui-env` → `ui-sdkwork-env`（`@deepseek-ai/dsh-client-ui-sdkwork-env`）
- `ui-iam` → `ui-sdkwork-iam`（`@deepseek-ai/dsh-client-ui-sdkwork-iam`）
- `ui-app-modes` → `ui-sdkwork-app-modes`
- `ui-appstore` → `ui-sdkwork-appstore`
- `ui-course` → `ui-sdkwork-course`
- `ui-drive` → `ui-sdkwork-drive`
- `ui-feedback` → `ui-sdkwork-feedback`
- `ui-generations-image`／`video`／`assets` → `ui-sdkwork-generations-*`
- `ui-knowledge` → `ui-sdkwork-knowledge`
- `ui-settings-menu` → `ui-sdkwork-settings-menu`
- `ui-token-plan` → `ui-sdkwork-token-plan`
- `ui-updater` → `ui-sdkwork-updater`
- `ui-window-controls` → `ui-sdkwork-window-controls`
- `desktop-carrier` → `sdkwork-desktop-carrier`
- `desktop-app`（bundle）→ `sdkwork-desktop-app`
- `sdkwork-env-bootstrap`（boot）——已符合规范

任何未列于此但仍在用普通名称的 fork 包，必须在下次上游同步前完成重命名并更新本台账。
