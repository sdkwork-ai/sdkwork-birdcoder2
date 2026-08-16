# Fork & Upstream Sync

English | [中文](FORK_SYNC.zh.md)

This repository is a **derived fork** of
[`sdkwork-ai/deepseek-harness-desktop`](https://github.com/sdkwork-ai/deepseek-harness-desktop)
(the SDKWork-maintained desktop distribution of DeepSeek Harness). It is an
independent project that will grow its own features, while staying able to pull
in upstream changes at any time.

Because `sdkwork-birdcoder2` and `deepseek-harness-desktop` live under the same
GitHub account, GitHub's built-in "fork" relationship cannot be created
(GitHub forbids forking a repository into the same owner). The fork relation is
therefore maintained with a classic two-remote git setup, which gives the same
sync capability plus full freedom to diverge.

## Remote layout

| Remote | URL | Role |
| --- | --- | --- |
| `upstream` | `https://github.com/sdkwork-ai/deepseek-harness-desktop.git` | Sync source (read-only) |
| `origin` | `git@github.com:sdkwork-ai/sdkwork-birdcoder2.git` | This project's own home |

View with: `git remote -v`

## Branches

- `main` is this project's development line. It starts from upstream `master`
  and is where all local/personalized changes are committed.
- Upstream branches are mirrored locally as `upstream/master`,
  `upstream/codex/container-wsl-validation`,
  `upstream/codex/unified-release-rc11`, and refreshed by `git fetch upstream`.

## Sync upstream into this project

### Quick way (recommended)

```sh
scripts/sync-upstream.sh
```

It fetches `upstream` (all branches and tags, pruned) and merges
`upstream/master` into the current branch. If there are no local changes, the
merge is a fast-forward. If you have local commits that touch the same lines,
resolve conflicts as usual, then commit the merge.

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
- Tags from upstream (`dsh-v0.1.0-rc.*`, `v0.1.0-rc.*`) are fetched and
  mirrored on `origin` so releases stay traceable.
- `deepseek-harness-desktop` is itself a fork of
  `deepseek-ai/deepseek-harness`; if you ever need the very original sources,
  add it as an extra remote: `git remote add deepseek https://github.com/deepseek-ai/deepseek-harness.git`
