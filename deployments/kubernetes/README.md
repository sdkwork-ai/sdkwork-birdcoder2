# SDKWork BirdCoder Kubernetes Deployment

English | [中文](README.zh.md)

This Helm chart deploys the stateless BirdCoder API gateway. BirdCoder owns no
database, migration, backup job, or persistent volume. Agents, skills, IAM, and
other dependency domains operate their own persistence and recovery procedures.

The baseline includes hardened pod security, exact-origin CORS configuration,
health probes, a network policy, and optional ServiceMonitor integration.

## Install

```bash
helm upgrade --install sdkwork-birdcoder2 ./deployments/kubernetes \
  -f deployments/kubernetes/values.yaml \
  --set image.digest='sha256:<immutable-image-digest>'
```

Set a real image digest and replace the reserved origin before enabling public
traffic. `auth.existingSecret` may reference an operator-managed Secret for
gateway credentials. Database credentials do not belong in this chart.

Use an immutable image tag, and pin the matching `sha256` digest during
production promotion so a tag cannot resolve to different bytes later.

## High Availability

`values-ha.yaml` scales the stateless gateway to three replicas with a
three-replica autoscaling floor, configures a disruption budget, and publishes
the production OpenTelemetry collector endpoint. The gateway is stateless: its
bounded synchronization refresh cache and in-flight registry live in process
memory, so horizontal scaling is safe without any external realtime store.
Redis-backed realtime is not implemented and is deliberately not advertised
here.

```bash
helm upgrade --install sdkwork-birdcoder2 ./deployments/kubernetes \
  -f deployments/kubernetes/values.yaml \
  -f deployments/kubernetes/values-ha.yaml \
  --set image.digest='sha256:<immutable-image-digest>'
```

## Observability

The chart exposes `/healthz`, `/readyz`, and `/metrics`. The ConfigMap publishes
the lifecycle environment, deployment profile, runtime target, exact CORS
origins, and OpenTelemetry settings only. It intentionally publishes no
database, device-state, or realtime-store configuration.
