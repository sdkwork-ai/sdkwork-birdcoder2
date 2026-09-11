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
| `origin` | `git@github.com:sdkwork-ai/sdkwork-birdcoder2.git` | This project's own home |

View with: `git remote -v`

## Branches

- `main` is this project's development line. It starts from upstream `master`
  and is where all local/personalized changes are committed.
- Upstream's long-lived branch is `master`, mirrored locally as
  `upstream/master` and refreshed by `git fetch upstream`. Upstream's own
  short-lived branches (release and dependabot branches) are fetched as well
  but are not part of this project's history.

## Sync upstream into this project

### Quick way (recommended)

```sh
scripts/sync-upstream.sh
```

It fetches `upstream` (all branches and tags, pruned) and merges
`upstream/master` into the current branch. If there are no local changes, the
merge is a fast-forward. If you have local commits that touch the same lines,
resolve conflicts as usual, then commit the merge.

Once the gap is large the working-tree merge becomes impractical (a few hundred
upstream commits over a thousand files stalls or gets killed). Land such a sync
through the repository's plumbing procedure instead — compose the merge with
`git merge-tree --write-tree`, adjudicate each conflict hunk, and create the
commit with `git commit-tree -p <ours> -p <upstream>` — so the result is still a
**real two-parent merge commit**, never a squash, with upstream history and
commit messages intact.

### Manual way

```sh
git fetch upstream --tags --prune
git merge upstream/master        # while on main (or any local branch)
```

Then publish the result:

```sh
git push origin main
```

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
