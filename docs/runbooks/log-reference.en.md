# Runbook — sdkwork-birdcoder2 log reference (EN)

## Reading logs

```bash
bin/docker-deploy.sh logs --environment production --tail 200          # bounded read (default)
bin/docker-deploy.sh logs --environment production --follow            # explicit follow
bin/docker-deploy.sh logs --environment production --export ./out      # export for tickets (redacted)
```

Healthy startup signature: the `app` service binds its
listener, `/healthz` returns 200, and module lifecycles report ready in
order.

## Common failure signatures

| Log signature | Meaning | Fix |
| --- | --- | --- |
| `connection refused ... 5432` / `... 6379` | database / Redis unreachable | `bin/doctor.sh --environment <env>` → ports/config checks |
| `relation "..." does not exist` | migration not applied | check the env database name; migrations are forward-only, restore a backup if needed |
| `/healthz` 503 with a dependency error | postgres/redis not ready | `bin/doctor.sh` health check + dependency container state |
| repeated `panic` + container restarts | startup crash loop | `bin/doctor.sh` resources → restart count; roll back the version |

## 6. Wiring prerequisites (implementation checklist)

1. `bin/lib/module.sh`: implement `sdkwork_image_build` (delegate to the repository's container build) plus `sdkwork_build_app` / `sdkwork_package_app` / `sdkwork_deploy_app` (declared app types: `server`).
2. `deployments/docker/bundle/`: land `deploy.sh` + `release.sh` + compose + `env/<environment>.env`×5 per OPERATIONS_SPEC.md §1.2 and DOCKER_SPEC.md §4 (log rotation, health gate included).
3. Acceptance: `node ../sdkwork-specs/tools/check-operations-conformance.mjs --root .` all green.

<!-- generated: scaffold-module-runbooks.mjs -->
