# Fork & Upstream Sync

English | [中文](FORK_SYNC.zh.md)

This repository is a **derived fork** of
[`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness)
— the upstream project itself. It is an independent project that will grow its
own features, while staying able to pull in upstream changes at any time.

The fork relation is maintained with a classic two-remote git setup rather than
GitHub's built-in fork feature: `upstream` tracks the original project for
sync, `origin` is this project's own home. That gives the same sync capability
plus full freedom to diverge; [AGENTS.md](AGENTS.md) defines the naming and
brand contracts that keep fork work from colliding with upstream.

## Remote layout

| Remote | URL | Role |
| --- | --- | --- |
| `upstream` | `https://github.com/deepseek-ai/deepseek-harness.git` | Sync source (read-only) |
| `origin` | `https://github.com/sdkwork-ai/sdkwork-birdcoder2.git` | This project's own home |

View with: `git remote -v`

## Branches

- `main` is this project's development line. It starts from upstream `master`
  and is where all local/personalized changes are committed.
- Upstream's long-lived branch is `master`, mirrored locally as
  `upstream/master` and refreshed by `git fetch upstream`. Upstream's own
  short-lived branches (release and dependabot branches) are fetched as well
  but are not part of this project's history.

## Sync upstream into this project

Syncing is incremental and repeatable: an **anchor** records the last upstream
commit already merged, so each run only handles what upstream added since —
instead of re-deriving the starting point and re-fighting old conflicts.

### The five steps

```sh
scripts/sync-upstream.sh status     # anchor vs upstream tip vs origin, plus the curated lists
scripts/sync-upstream.sh prepare    # clean/push checks, rollback point, fetch, scope report
scripts/sync-upstream.sh merge      # real two-parent --no-ff merge, conflict census
#   ... resolve conflicts, then: git add <resolved paths> ...
scripts/sync-upstream.sh verify     # the post-merge checks
scripts/sync-upstream.sh anchor     # record the new upstream tip, commit it with the merge
```

`prepare` refuses to continue while the tree is dirty or while local commits are
not on `origin` yet, pins `upstream`'s push URL to `DISABLED` (the remote is a
read-only source), prints the curated keep/delete lists recorded in the anchor,
tags the current HEAD as `backup/pre-sync-<timestamp>` plus the rolling
`backup/pre-sync`, fetches with `--tags --prune` (plus one `git lfs fetch`
when the repository tracks LFS objects), and reports the scope of the range. If
the anchor already equals the fetched tip it stops with `ALREADY CURRENT` and
creates no commit; the upstream tip at fetch time is this round's ceiling, later
pushes belong to the next round. If the range is large it prints the
per-directory breakdown and waits for a decision (`SYNC_ALLOW_LARGE=1`
overrides, or merge per directory in batches).

`merge` always runs `git merge --no-ff` — never squash, rebase, or cherry-pick.
Rewriting local history invalidates the merge-base, and the next sync then
treats every upstream commit as new. It stops instead of merging when the anchor
is no longer an ancestor of upstream (the signature of an upstream force-push).

### The anchor

`.sdkwork/upstream-sync-anchor.json` holds the upstream URL and branch, the last
synced SHA and release tag, and the merge commit that brought it in. It is
committed together with the merge — that is what keeps the next run incremental.
Each run also tags that merge as `sync/upstream-<sha7>-<YYYYMMDD>`; those tags
stay local, so they can never collide with the fork's own version tags.

The same file carries the two lists that stop every round from re-arguing the
same files:

| List | Meaning |
| --- | --- |
| `keptByFork` | Upstream deleted it; this fork deliberately keeps it. An entry ending in `/` covers its whole subtree. |
| `deletedByFork` | Upstream ships it; this fork deliberately does not. |

`status` and `prepare` print them, `verify` asserts they still describe the
tree, and `scripts/sync-upstream.sh lists` re-derives both candidate sets from
git and reports anything the record does not cover — that is how a newly
diverged path gets recorded instead of rediscovered.

### Conflict policy

Decide per file, never per tree:

| Situation | Resolution |
| --- | --- |
| Brand assets, sdkwork components/plugins/routing/vendor, fork-only files | keep this repository's version |
| Upstream core behavior | take upstream |
| Both sides changed the same surface | merge both behaviors, upstream structure as the baseline |
| Upstream deleted a file this fork modified | decide per file, and record the outcome in the report |
| Dependency manifests | union: keep upstream's new entries and the local ones |
| Lockfile | take upstream, then reinstall |
| Renames | merge by meaning, never leave old and new copies behind |

Never `git checkout --ours .` / `--theirs .`, never `-X ours` / `-X theirs`,
never delete files to make a conflict disappear, never skip hooks, never force
push, never `git clean -fdx`.

### Verify

`verify` is mechanical, in this order:

1. the upstream tip is an ancestor of `HEAD` and zero upstream commits are missing;
2. no conflict markers, no unmerged index entries;
3. every path deleted since the rollback point is gone from upstream too (no accidental deletion);
4. **every file this fork never touched is byte-identical to upstream** in the merge result — the one check that catches upstream content being silently swallowed, which a per-file conflict review cannot see;
5. the brand surfaces, the sdkwork packages and the recorded keep/delete lists still hold.

It also reports the version family (`package.json` == newest upstream tag ==
first `CHANGELOG.md` heading). Only after it passes does `anchor` advance the
record.

### Manual way

```sh
git fetch upstream --tags --prune
git merge --no-ff upstream/master        # while on main (or any local branch)
git push origin main
```

For an extremely large gap the working-tree merge can stall; such a sync may be
composed with `git merge-tree --write-tree` and committed with
`git commit-tree -p <ours> -p <upstream>` instead. The result is still a **real
two-parent merge commit**, never a squash, with upstream history and commit
messages intact.

## Keep local (personalized) changes

This project is a new version of the harness and is expected to diverge:

1. Do all local work on `main` (or feature branches) and commit normally.
2. Sync from upstream whenever you need the latest fixes (`sync-upstream.sh`).
3. Merge conflicts only arise when upstream touched the same code you changed;
   resolve them like any git merge. `git log --merge` and `git diff
   upstream/master` help understand what changed upstream.
4. Never rewrite published history on `origin/main` unless the team agrees
   (use `git push --force-with-lease` only in that case).

## Notes

- The upstream default branch is `master`; this fork's development branch is
  `main` on both local and `origin`.
- Upstream release tags (`dsh-v<version>`) are fetched and mirrored on `origin`
  so releases stay traceable.
- `upstream` points at `deepseek-ai/deepseek-harness` itself, so no extra remote
  is needed to reach the original sources.
- History: an SDKWork desktop distribution,
  `sdkwork-ai/deepseek-harness-desktop`, once sat between this project and
  upstream. It has been **deleted**; every remote and sync tool in this
  repository already points at `deepseek-ai/deepseek-harness` directly.
