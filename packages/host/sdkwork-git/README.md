---
description: "Local git repository reads and branch checkout for the host: the sdkworkGit service that validates the directory, runs the git CLI through simple-git with a wall-clock bound, and reports status, branches, graph log, and checkout outcomes."
kind: "package-reference"
---

# @deepseek-ai/dsh-sdkwork-git

English | [中文](README.zh.md)

## Summary

Host capability for the session-header git pill: `sdkworkGit.status(cwd)` reports the checked-out branch (null on detached HEAD), the HEAD commit, the uncommitted file count (every staged, modified, and untracked path one `git status` reports), and ahead/behind counts; `sdkworkGit.branches(cwd)` lists the local branches (current first, then name order); `sdkworkGit.checkout(cwd, branch)` switches to an existing local branch after confirming it exists; `sdkworkGit.createAndCheckout(cwd, name)` validates the name through `git check-ref-format` before creating and switching; `sdkworkGit.log(cwd, limit)` returns recent commits with their parent topology and ref decorations (HEAD branch, local branches, remote-tracking refs classified against `refs/remotes`, tags). Every call validates the directory (absolute, existing, a directory) and its repository status (`git rev-parse` through simple-git's `checkIsRepo`) before any git command runs. Git subprocesses run with a 15-second wall-clock block timeout, so a wedged repository cannot hang the wire. The wire face over this seam is the [`sdkwork-git-controller`](../../api/sdkwork-git-controller/README.md) Remote; this package owns no transport.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>

## Use this package

Mount the service in a host profile (`static inject = ['sdkworkGit']` from the controller does it in the composed web-app bundle) and call the five seam methods with an absolute repository directory. Failures raise `SdkworkGitError` with one of five codes — `cwd-unreadable`, `not-a-repo`, `branch-name-invalid`, `checkout-failed`, `command-failed` — which the controller projects onto the `git/*` wire vocabulary.

<a id="understand-the-implementation"></a>

## Understand the implementation

Each call builds a fresh simple-git handle bound to the resolved directory (stateless; no cached repository state). Branch listings parse `git branch --format=%(refname:short) %(objectname) %(HEAD)` — refnames never contain spaces, so each row is name, sha, and the optional ` *` marker. The graph log parses `log --pretty=format:%x1e…%x1f…` control-character-separated rows (hash, parents, author, time, %D decorations, subject) and classifies the decorations against a `for-each-ref refs/remotes` set, since a local branch may legitimately contain a slash; the HEAD branch is attributed from rev-parse, which does not depend on the decoration format. `checkout` confirms the branch exists locally before switching, so a missing branch fails as `checkout-failed` instead of leaking raw git output; `createAndCheckout` checks the ref format before touching HEAD, failing as `branch-name-invalid`.

<a id="further-exploration"></a>

## Further Exploration

- [`types.ts`](./src/types.ts) — the seam vocabulary shared with the controller.
- [`tests/git-service.spec.ts`](./tests/git-service.spec.ts) — real-git coverage over hermetic temp repositories: open validation, status counts, branch ordering, checkout, create-and-checkout, decoration classification, and limit bounds.

<a id="known-limitations-and-deferred-work"></a>

## Dev Note

This is a fork package (`sdkwork` marker) following the repository naming contract. Branch listings and the graph log parse git's own output formats (`branch --format` rows and `log --pretty=format` records), so a git upgrade that changes those formats must update the parsers in the same change.

## Runtime invariants

No runtime-invariant companion is published; the seam is stateless per call and every failure is a closed-vocabulary rejection.

## Model Experience

None, as the capability only reads repository state and performs user-requested checkouts; it registers no prompt, schema, or result presentation of its own.

#### KV Cache effect

None; status, branch, graph, and checkout results ride the wire to the UI and never enter model context.

## Known Limitations and Deferred Work

- Requires the git CLI on the host PATH; a composition without git fails every call as `command-failed`.
- Unborn repositories (no commits yet) fail `status` because HEAD cannot resolve; surfacing them as a first-class state is deferred.
- Only local branches; remote-tracking branches and push/pull flows are deferred.
