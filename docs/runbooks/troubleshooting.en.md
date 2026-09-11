# Runbook — sdkwork-birdcoder2 troubleshooting (EN)

Symptom → `bin/doctor.sh --environment <env>` check → fix.

## 1. Instance unhealthy

```bash
bin/doctor.sh --environment staging
bin/docker-deploy.sh status --environment staging
```

- `health FAIL`: reproduce with `curl -fsS http://127.0.0.1:<mgmt-port>/healthz`; inspect recent errors with `bin/docker-deploy.sh logs --environment staging --tail 200`.

## 2. Port not listening

```bash
bin/doctor.sh --environment staging          # the ports check reports expected ports
```

- Port taken: change `*_HOST_PORT` in the bundle env file and replay `bin/docker-deploy.sh install`.

## 3. Config drift / placeholder secrets

```bash
bin/config.sh diff --environment staging
bin/config.sh validate --environment staging
bin/config.sh set --environment staging --key <KEY> --value '<real-value>'
```

## 4. Image drift (running version differs from the ledger)

```bash
bin/docker-deploy.sh status --environment staging
```

- A mismatch between the reported image and the release ledger is a drift
  alert: `bin/docker-deploy.sh rollback --environment staging --to <ledger-version>`.

## 6. Wiring prerequisites (implementation checklist)

1. `bin/lib/module.sh`: implement `sdkwork_image_build` (delegate to the repository's container build) plus `sdkwork_build_app` / `sdkwork_package_app` / `sdkwork_deploy_app` (declared app types: `server`).
2. `deployments/docker/bundle/`: land `deploy.sh` + `release.sh` + compose + `env/<environment>.env`×5 per OPERATIONS_SPEC.md §1.2 and DOCKER_SPEC.md §4 (log rotation, health gate included).
3. Acceptance: `node ../sdkwork-specs/tools/check-operations-conformance.mjs --root .` all green.

<!-- generated: scaffold-module-runbooks.mjs -->
