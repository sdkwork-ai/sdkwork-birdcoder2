# Runbook — sdkwork-birdcoder2 故障排查（中文）

症状 → `bin/doctor.sh --environment <env>` 检查项 → 处置。

## 1. 实例不健康

```bash
bin/doctor.sh --environment staging
bin/docker-deploy.sh status --environment staging
```

- `health FAIL`：`curl -fsS http://127.0.0.1:<管理端口>/healthz` 复现；`bin/docker-deploy.sh logs --environment staging --tail 200` 看最近错误。

## 2. 端口未监听

```bash
bin/doctor.sh --environment staging          # ports 检查项给出期望端口
```

- 被占用：改 bundle env 文件里的 `*_HOST_PORT` 后 `bin/docker-deploy.sh install` 重放。

## 3. 配置漂移 / 占位符密钥

```bash
bin/config.sh diff --environment staging
bin/config.sh validate --environment staging
bin/config.sh set --environment staging --key <KEY> --value '<真实值>'
```

## 4. 镜像漂移（跑的不是台账版本）

```bash
bin/docker-deploy.sh status --environment staging
```

- status 输出的镜像与发布台账（release ledger）不一致即为 drift 告警：`bin/docker-deploy.sh rollback --environment staging --to <台账版本>`。

## 6. 接线前置条件（实施清单）

1. `bin/lib/module.sh`：实现 `sdkwork_image_build`（对接仓库的容器构建命令）、`sdkwork_build_app` / `sdkwork_package_app` / `sdkwork_deploy_app`（声明了 app 类型：`server`）。
2. `deployments/docker/bundle/`：按 OPERATIONS_SPEC.md §1.2 与 DOCKER_SPEC.md §4 落地 `deploy.sh` + `release.sh` + compose + `env/<environment>.env`×5（含日志轮转、health 门禁）。
3. 验收：`node ../sdkwork-specs/tools/check-operations-conformance.mjs --root .` 全绿。

<!-- generated: scaffold-module-runbooks.mjs -->
