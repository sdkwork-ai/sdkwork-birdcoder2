# Runbook — sdkwork-birdcoder2 backup & restore (EN)

## 1. Backup

```bash
bin/backup.sh create --environment production            # config + database + volumes, sha256 checksummed
bin/backup.sh list   --environment production
bin/backup.sh verify --environment production            # verify the latest set
```

Backup sets live on the target host under `/opt/deploy/sdkwork-birdcoder2/backups/`.
RPO: daily in production plus before every upgrade; RTO: production restore
completes within 4 hours.

## 2. Restore (destructive, requires --yes)

```bash
bin/backup.sh restore --environment production --set <set-name> --yes
bin/docker-deploy.sh install --environment production     # bring the stack back up after restore
```

## 3. Drill

Once per quarter, perform a real restore into a scratch environment (not just
`verify`).

## 6. Wiring prerequisites (implementation checklist)

1. `bin/lib/module.sh`: implement `sdkwork_image_build` (delegate to the repository's container build) plus `sdkwork_build_app` / `sdkwork_package_app` / `sdkwork_deploy_app` (declared app types: `server`).
2. `deployments/docker/bundle/`: land `deploy.sh` + `release.sh` + compose + `env/<environment>.env`×5 per OPERATIONS_SPEC.md §1.2 and DOCKER_SPEC.md §4 (log rotation, health gate included).
3. Acceptance: `node ../sdkwork-specs/tools/check-operations-conformance.mjs --root .` all green.

<!-- generated: scaffold-module-runbooks.mjs -->
