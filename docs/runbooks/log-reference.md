# Runbook — sdkwork-birdcoder2 日志参考（中文）

## 读取

```bash
bin/docker-deploy.sh logs --environment production --tail 200          # 有界读取（默认）
bin/docker-deploy.sh logs --environment production --follow            # 显式跟随
bin/docker-deploy.sh logs --environment production --export ./out      # 导出工单附件（脱敏）
```

健康启动日志特征：`app` 服务监听就绪，`/healthz` 返回 200，模块生命周期依次 ready。

## 常见失败签名

| 日志特征 | 含义 | 处置 |
| --- | --- | --- |
| `connection refused ... 5432` / `... 6379` | 数据库 / Redis 不可达 | `bin/doctor.sh --environment <env>` 看 ports/config 检查项 |
| `relation "..." does not exist` | 迁移未应用 | 检查 env 数据库名；迁移前向执行，必要时恢复备份 |
| `/healthz` 503 依赖不可用 | postgres/redis 未就绪 | 看 `bin/doctor.sh` 的 health 检查项与依赖容器状态 |
| 反复 `panic` + 容器重启 | 启动崩溃循环 | 看 `bin/doctor.sh` resources 的 restart count；回滚版本 |

## 6. 接线前置条件（实施清单）

1. `bin/lib/module.sh`：实现 `sdkwork_image_build`（对接仓库的容器构建命令）、`sdkwork_build_app` / `sdkwork_package_app` / `sdkwork_deploy_app`（声明了 app 类型：`server`）。
2. `deployments/docker/bundle/`：按 OPERATIONS_SPEC.md §1.2 与 DOCKER_SPEC.md §4 落地 `deploy.sh` + `release.sh` + compose + `env/<environment>.env`×5（含日志轮转、health 门禁）。
3. 验收：`node ../sdkwork-specs/tools/check-operations-conformance.mjs --root .` 全绿。

<!-- generated: scaffold-module-runbooks.mjs -->
