# Agent Note: Pin sibling commits with the release lockfile

Status: implemented

English | [中文](2026-08-17-pinned-sdkwork-sibling-lockfiles.zh.md)

## Problem

The release workspace includes source from private SDKWork sibling repositories through `pnpm-workspace.yaml`, while GitHub Actions obtains those repositories separately. A lockfile generated against a dirty local sibling can therefore describe manifests that the workflow does not check out, causing `pnpm install --frozen-lockfile` to reject every packaging job.

## Decision

The sibling setup action checks out each repository at an immutable commit, and the root `pnpm-lock.yaml` is maintained against those exact sibling manifests. The appbase pin is `7455ba839f2b7aed6fd7c437d1093628f08fa4d2`; the appstore pin is `ba039cc25a9ea40ccfbf585980796438c218584c`. Their frontend packages do not declare backend SDKs, while their backend or app SDK importers use workspace dependency specifiers matching those commits.

A sibling update changes the action ref and the root lockfile in the same root change. Local uncommitted sibling manifests are not release authorities and do not determine the root lockfile. The appbase repository separately owns its source and lockfile changes; the root repository records only the immutable ref and the resulting root lockfile state.

## Alternatives considered

**Resolve siblings from their default branches.** A moving branch makes the checkout and lockfile relationship time-dependent, so a later workflow run could use different manifests without a root change.

**Generate the release lockfile from the developer's sibling worktrees.** Local worktrees can contain uncommitted dependency edits that are absent from the commit fetched by CI; this is the failure mode the decision removes.

**Replace sibling workspace links with published package versions.** The release workspace consumes sibling source directly and the requested release does not publish npm packages; registry versions would remove source synchronization while adding an unavailable publication step.

## Consequences

Release installs are reproducible with respect to sibling source and fail when a pinned commit is unavailable instead of silently selecting another revision. Sibling updates require coordinated changes to the action ref and root lockfile. A clean isolated install confirmed that the corrected pin reaches dependency resolution without an outdated-lockfile error, but this host could not complete package downloads because registry requests were destroyed by the local network environment.

## Testing

The corrected appbase commit resolves to `7455ba839f2b7aed6fd7c437d1093628f08fa4d2`, and its backend manifest uses `workspace:*` for both workspace dependencies. The isolated `pnpm install --frozen-lockfile --ignore-scripts` run progressed past frozen-lockfile validation and stopped on registry/network errors.
