# Agent Note: Explicit non-loopback Web deployment opt-in

Status: implemented

English | [中文](2026-08-15-explicit-non-loopback-web-opt-in.zh.md)

## Problem

Container and Kubernetes deployments need the Web runner to accept traffic from a Service or ingress, but the unauthenticated Web carrier must not become network-reachable through an accidental host value or a copied command line.

## Decision

The Web CLI accepts `--host 0.0.0.0` only when the same invocation also names `--allow-non-loopback`. The flag is rejected for every other host, and the all-interface host is rejected without it. The opt-in changes bind reachability only; it does not add authentication, TLS, origin policy, or access to methods that remain loopback-pinned. Deployments must place the process behind an authenticated TLS-terminating boundary, declare serving authorities with `--trusted-host` or `trustedHosts`, and keep the persistent `DSH_HOME` outside the image.

## Alternatives considered

**Keep all-interface binding permanently unavailable.** Rejected because a supported container or Kubernetes deployment needs a process that can receive traffic through its local Service or reverse proxy.

**Allow `--host 0.0.0.0` without a second flag.** Rejected because a copied deployment command could expose the unauthenticated carrier without making the operator acknowledge the network-facing mode at the call site.

**Add authentication to the Web carrier in this change.** Rejected because authentication and TLS termination belong to the deployment boundary; the carrier's Host/origin fence remains a reachability policy and does not establish user identity.

## Consequences

The default `dsh web` behavior remains loopback-only. A container entrypoint can use `dsh web --host 0.0.0.0 --allow-non-loopback`, but the image and manifests must provide the external trust authorities and an authenticated ingress or reverse proxy. Privileged configuration, credential, native-file, and preset-authoring methods remain available only to loopback clients. Startup tests cover both rejected flag combinations and the accepted explicit pair.

Decision context: [Explicit web bind address](../../archived/feature/2026-07-22-web-bind-address.md).
