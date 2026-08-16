#!/usr/bin/env bash
# Sync upstream deepseek-harness-desktop changes into this fork.
# Fetches all upstream branches/tags (pruned), then merges upstream/master
# into the current branch. Local commits are preserved; resolve conflicts as
# with any git merge, then push to origin yourself.
set -euo pipefail

root=$(git rev-parse --show-toplevel)
cd "$root"

if ! git remote get-url upstream >/dev/null 2>&1; then
  echo "error: no 'upstream' remote found; add it with:" >&2
  echo "  git remote add upstream https://github.com/sdkwork-ai/deepseek-harness-desktop.git" >&2
  exit 1
fi

echo "==> fetching upstream (branches + tags, pruned)"
git fetch upstream --tags --prune

current=$(git branch --show-current)
echo "==> merging upstream/master into '$current'"
if git merge upstream/master --no-edit; then
  echo
  echo "sync complete. Changes are committed locally; publish with:"
  echo "  git push origin $current"
else
  echo
  echo "merge conflicts need resolution; after resolving run:"
  echo "  git add <resolved files> && git commit"
  echo "then: git push origin $current"
fi
