# Runbook — sdkwork-birdcoder2 部署 / 升级 / 回滚（中文）

适用环境：`development|test|staging|demo|production`。所有命令默认在本机 WSL 执行，远程主机加 `--host ssh://[user@]host[:port]`。镜像参考：`registry.sdkwork.com/apps/sdkwork-birdcoder2:0.1.0`（tag 取自 `sdkwork.app.config.json` → `release.currentVersion`）。

> ⚠️ **接线状态**：本模块的 `bin/` 九入口已按 MODULE_BIN_SPEC.md 挂载，但镜像构建钩子与部署 bundle 尚未接线：
> - `bin/lib/module.sh` → `sdkwork_image_build` 仍是脚手架占位（执行会以明确错误退出）；
> - `deployments/docker/bundle/`（deploy.sh + release.sh + compose + env×5）尚未落地。
>
> 因此 §1 安装 / §2 升级 在接线前**不可执行**；其余章节（status / logs / rollback / down）命令本身可复制即用。

## 1. 安装（首次）

```bash
bin/docker-deploy.sh install --environment <development|test|staging|demo|production>
bin/docker-deploy.sh install --environment production --yes   # 生产必须显式 --yes
```

install 会同步 bundle 到 `/opt/deploy/sdkwork-birdcoder2/bundle`，加载镜像，按实例启动并等待健康门禁（`/healthz`）。

## 2. 升级

staging/demo/production 自动先生成变更前备份（`--skip-backup` 可跳过，会记录证据）：

```bash
bin/docker-image.sh build
bin/docker-deploy.sh upgrade --environment staging --image-tag 0.1.0
```

## 3. 验证（发布门禁）

```bash
bin/docker-deploy.sh status --environment staging
bin/doctor.sh --environment staging          # 聚合诊断（9 项检查）
```

## 4. 回滚

```bash
bin/docker-deploy.sh rollback --environment staging                  # 台账上一个成功版本
bin/docker-deploy.sh rollback --environment staging --to 0.1.0       # 指定版本
```

回滚由管理端口 `/healthz` 门禁把关；失败自动回退并写入 `release-state/<env>/ledger.jsonl`。迁移是前向的：跨不兼容 schema 只能走数据恢复（backup-restore.md）。

## 5. 下线

```bash
bin/docker-deploy.sh down --environment staging
bin/docker-deploy.sh stop    --environment staging   # 停止（保留容器与卷，不重打包）
bin/docker-deploy.sh start   --environment staging   # 启动已停止的栈（先起嵌入式依赖）
bin/docker-deploy.sh restart --environment staging   # 只重启应用实例（依赖不中断）
bin/docker-deploy.sh down --environment staging --purge --yes
```

## 6. 接线前置条件（实施清单）

1. `bin/lib/module.sh`：实现 `sdkwork_image_build`（对接仓库的容器构建命令）、`sdkwork_build_app` / `sdkwork_package_app` / `sdkwork_deploy_app`（声明了 app 类型：`server`）。
2. `deployments/docker/bundle/`：按 OPERATIONS_SPEC.md §1.2 与 DOCKER_SPEC.md §4 落地 `deploy.sh` + `release.sh` + compose + `env/<environment>.env`×5（含日志轮转、health 门禁）。
3. 验收：`node ../sdkwork-specs/tools/check-operations-conformance.mjs --root .` 全绿。

<!-- generated: scaffold-module-runbooks.mjs -->
