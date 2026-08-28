# SDKWork BirdCoder Kubernetes 部署

English | [中文](README.md)

该 Helm chart 部署无状态的 BirdCoder API 网关。BirdCoder 不拥有数据库、迁移任务、备份任务或持久化卷。Agents、skills、IAM 及其他依赖域自行维护各自的持久化与恢复流程。

基线包含加固的 pod 安全策略、精确来源的 CORS 配置、健康探针、网络策略，以及可选的 ServiceMonitor 集成。

## 安装

```bash
helm upgrade --install sdkwork-birdcoder2 ./deployments/kubernetes \
  -f deployments/kubernetes/values.yaml \
  --set image.digest='sha256:<immutable-image-digest>'
```

启用公网流量前，请设置真实的镜像 digest 并替换保留来源。`auth.existingSecret` 可以引用由运维管理的 Secret 来存放网关凭据。数据库凭据不属于本 chart。

请使用不可变的镜像 tag，并在生产环境提升时固定匹配的 `sha256` digest，以免 tag 之后解析到不同的字节。

## 高可用

`values-ha.yaml` 将无状态网关扩到三个副本，并设置三副本的自动扩缩下限、配置干扰预算，以及发布生产 OpenTelemetry collector 端点。网关是无状态的：其有界的同步刷新缓存与进行中的注册表都位于进程内存中，因此无需任何外部实时存储即可安全水平扩展。基于 Redis 的实时方案未实现，此处也刻意不做宣传。

```bash
helm upgrade --install sdkwork-birdcoder2 ./deployments/kubernetes \
  -f deployments/kubernetes/values.yaml \
  -f deployments/kubernetes/values-ha.yaml \
  --set image.digest='sha256:<immutable-image-digest>'
```

## 可观测性

本 chart 暴露 `/healthz`、`/readyz` 与 `/metrics`。ConfigMap 只发布生命周期环境、部署 profile、运行时目标、精确 CORS 来源与 OpenTelemetry 设置。它刻意不发布任何数据库、设备状态或实时存储配置。
