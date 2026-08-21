# SDKWork BirdCoder2 deployment standard adoption

- Date: 2026-08-20
- Kind: feature
- Status: implemented

## Problem

`sdkwork-birdcoder2` (DeepSeek Harness + SDKWork plugins) lacked the v2 deployment
contract: no `deployments/deploy.yaml`, `specs/topology.spec.json`,
`etc/topology/*.env`, `sdkwork.workflow.json`, or `deployments/kubernetes/`.
Validators `check-deploy-standard`, `check-topology-deployment-profiles`, and
strict manifest release alignment all failed.

## Decision

Mirror the `sdkwork-birdcoder` deployment layout with harness-specific deltas:

- `appId` follows the repository directory (`sdkwork-birdcoder2`);
  `applicationCode` is `birdcoder2`.
- Registered cloud hosts use the `harness*.sdkwork.com` role row; platform
  gateway hosts stay on the shared `api*.sdkwork.com` registry.
- Application ingress is `dsh web` (loopback `7780` in development, container
  `4080` in production) instead of the Rust standalone gateway on `10240`.
- `deploy.yaml` exposes `web: pc` because the web shell lives at `apps/web`,
  not `apps/sdkwork-birdcoder2-pc/` (validator warning only).
- Desktop Electron remains the primary standalone deliverable; cloud profiles ship
  the container image through the copied Helm chart adapted to port `4080`.

## Verification

```bash
node ../sdkwork-specs/tools/check-topology-deployment-profiles.mjs --root .
node ../sdkwork-specs/tools/check-deploy-standard.mjs
node ../sdkwork-specs/tools/check-app-manifest-deployment-standard.mjs --root . --strict-release-targets
```

All pass; deploy validation emits expected warnings for the non-canonical `apps/web`
layout.
