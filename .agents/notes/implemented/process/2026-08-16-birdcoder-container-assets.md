# Agent Note: BirdCoder container asset names

Status: implemented

English | [中文](2026-08-16-birdcoder-container-assets.zh.md)

## Problem

The container release assets kept the harness family prefix: `dsh-container-<version>.tar.gz`, `dsh-container-image-<version>-linux-<arch>.tar.gz`, and the deployment-bundle directory `dsh-container-<version>/`. The desktop installers were already branded `BirdCoder-*`, so the k8s and Docker download names were the only release assets that did not match the product identity.

## Decision

Every container packaging name now uses the `birdcoder-container` prefix: the deployment archive and its checksum, both image archives and their checksums, the Actions artifact names, the staging and extracted directory `birdcoder-container-<version>/`, and the local archive name `birdcoder-container-local.tar` in the installation docs. The [pack-container](../../../../scripts/release/pack-container.ts) script, the [release assembler](../../../../scripts/release/assemble-github-release.ts), the [container workflow](../../../../.github/workflows/container-release.yml), the container verification gate, and the installation and deployment guides were updated together. The image repository name `localhost/deepseek-harness` is unchanged: it is the image reference inside Compose and Kubernetes manifests, not a release asset name, and the repository naming contract owns it.

## Alternatives considered

**Keep the `dsh-container` prefix.** Release assets would stay split between BirdCoder desktop installers and dsh-named container files, which is the inconsistency the fork branding removed everywhere else.

**Rename the image repository to `localhost/birdcoder` too.** The image reference is a deployment identity governed by the repository naming contract and shared with source-build and registry-retag instructions; renaming it belongs to a separate decision from the release asset names.

## Consequences

The next `birdcoder-v<version>` release publishes `birdcoder-container-<version>.tar.gz`, its checksum, and `birdcoder-container-image-<version>-linux-{amd64,arm64}.tar.gz` with checksums. Old `dsh-container-*` assets remain readable on the previous release only; new downloads use the renamed files.
