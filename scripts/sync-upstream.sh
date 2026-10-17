#!/usr/bin/env bash
# Incremental upstream sync for the SDKWork BirdCoder fork.
#
#   scripts/sync-upstream.sh status     read-only: anchor vs local refs vs remote truth + curated lists
#   scripts/sync-upstream.sh prepare    push/clean checks, rollback point, fetch, scope report
#   scripts/sync-upstream.sh merge      real two-parent merge (--no-ff), conflict census
#   scripts/sync-upstream.sh verify     the post-merge checks, including the byte-identical audit
#   scripts/sync-upstream.sh anchor     record the synced upstream tip (only after verify passes)
#   scripts/sync-upstream.sh lists      read-only: re-derive the curated lists and diff them
#   scripts/sync-upstream.sh fetch      fetch upstream --tags --prune (plus LFS when tracked)
#
# The anchor lives in .sdkwork/upstream-sync-anchor.json and is committed together
# with the merge, so the next run starts from the right place instead of guessing
# from the merge-base. Upstream's push URL is pinned to DISABLED: this repository
# only ever reads from it.
#
# The same file carries two curated lists, and they are the reason this stays
# cheap to repeat: `keptByFork` (upstream deleted it, this fork deliberately
# keeps it) and `deletedByFork` (upstream ships it, this fork deliberately does
# not). `status` and `prepare` print them, `verify` asserts they still hold, and
# `lists` re-derives the candidates from git so a newly diverged path cannot hide.
# Each run also tags the synced merge as sync/upstream-<sha7>-<YYYYMMDD> for
# retrospective lookup; those tags stay local (upstream release tags are never
# pushed to origin, so they cannot collide with the fork's own version tags).
#
# Merge policy enforced here: git merge --no-ff, never squash/rebase/cherry-pick.
# Rewriting local history breaks the merge-base, and the next sync then re-fights
# every upstream commit as if it were new.
#
# Optional environment:
#   SYNC_GIT_PROXY         proxy for network git commands (retry uses 127.0.0.1:7897)
#   SYNC_LARGE_COMMITS     commit count that asks for a decision (default 50)
#   SYNC_LARGE_FILES       changed-path count that asks for a decision (default 300)
#   SYNC_MAX_CONFLICTS     conflict count that asks for a decision (default 40)
#   SYNC_ALLOW_LARGE=1     proceed anyway when the scope thresholds trip
#   SYNC_RENAME_LIMIT      rename detection budget for the merge (default 50000)
set -euo pipefail

UPSTREAM_URL="https://github.com/deepseek-ai/deepseek-harness.git"
UPSTREAM_BRANCH="master"
ANCHOR_FILE=".sdkwork/upstream-sync-anchor.json"
ROLLING_BACKUP="backup/pre-sync"
LARGE_COMMITS="${SYNC_LARGE_COMMITS:-50}"
LARGE_FILES="${SYNC_LARGE_FILES:-300}"
MAX_CONFLICTS="${SYNC_MAX_CONFLICTS:-40}"
RENAME_LIMIT="${SYNC_RENAME_LIMIT:-50000}"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
info() { printf '%s\n' "$*"; }
kv() { printf '%-24s: %s\n' "$1" "$2"; }
rule() { printf -- '------------------------------------------------------------\n'; }

root=$(git rev-parse --show-toplevel 2>/dev/null) || die "not inside a git work tree"
cd "$root"
gitdir=$(git rev-parse --git-dir)
mkdir -p "$gitdir/sync"

# Network git: HTTP/1.1 is mandatory on this project's Windows hosts (HTTP/2
# breaks smart-HTTP behind the local transparent proxy), and credentials must
# never block on an interactive prompt.
net_git() {
  local proxy="${SYNC_GIT_PROXY-}"
  if [ -n "$proxy" ]; then
    GIT_TERMINAL_PROMPT=0 git -c http.version=HTTP/1.1 \
      -c http.proxy="$proxy" -c https.proxy="$proxy" "$@"
  else
    GIT_TERMINAL_PROMPT=0 git -c http.version=HTTP/1.1 "$@"
  fi
}

remote_sha() {
  local remote=$1 ref=$2 out
  out=$(net_git ls-remote --heads "$remote" "$ref" 2>/dev/null | cut -f1 | head -1 || true)
  if [ -z "$out" ]; then
    out=$(SYNC_GIT_PROXY="${SYNC_GIT_PROXY:-http://127.0.0.1:7897}" \
      net_git ls-remote --heads "$remote" "$ref" 2>/dev/null | cut -f1 | head -1 || true)
  fi
  printf '%s\n' "$out"
}

anchor_sha() {
  [ -f "$ANCHOR_FILE" ] || return 0
  sed -n 's/.*"lastSyncedSha": *"\([0-9a-f]\{40\}\)".*/\1/p' "$ANCHOR_FILE" | head -1
}

# Any scalar field of the anchor record, by key name.
anchor_field() {
  [ -f "$ANCHOR_FILE" ] || return 0
  sed -n "s/.*\"$1\": *\"\([^\"]*\)\".*/\1/p" "$ANCHOR_FILE" | head -1
}

# Paths recorded in one of the curated lists. The section runs from
# `"<key>": [` to the matching `  ],`; every entry is a one-line object with a
# `"path"` key, so the list stays readable and mechanically extractable.
json_section_paths() {
  local key=$1
  [ -f "$ANCHOR_FILE" ] || return 0
  awk -v key="$key" '
    index($0, "\"" key "\": [") { inside = 1; next }
    inside && /^  \],?$/          { inside = 0; next }
    inside && match($0, /"path": "[^"]*"/) {
      s = substr($0, RSTART, RLENGTH)
      sub(/^"path": "/, "", s)
      sub(/"$/, "", s)
      print s
    }
  ' "$ANCHOR_FILE"
}

list_count() { json_section_paths "$1" | grep -c . || true; }

print_lists() {
  local kept deleted
  kept=$(list_count keptByFork)
  deleted=$(list_count deletedByFork)
  kv "kept by fork" "${kept:-0} recorded (upstream deleted, this fork keeps)"
  json_section_paths keptByFork | sed 's/^/    keep    /'
  kv "deleted by fork" "${deleted:-0} recorded (upstream ships, this fork does not)"
  json_section_paths deletedByFork | sed 's/^/    drop    /'
}

# The lists are only useful if they still describe reality: a kept path that
# vanished, or a deleted path that came back, means a previous adjudication was
# silently reverted and needs a decision instead of another round of guessing.
check_lists() {
  local p bad=0 kept=0 deleted=0
  while IFS= read -r p; do
    [ -n "$p" ] || continue
    kept=$((kept + 1))
    if git cat-file -e "HEAD:$p" 2>/dev/null; then
      :
    else
      info "  MISSING kept path: $p (recorded as deliberately kept, now absent from HEAD)"
      bad=$((bad + 1))
    fi
  done < <(json_section_paths keptByFork)

  while IFS= read -r p; do
    [ -n "$p" ] || continue
    deleted=$((deleted + 1))
    if git cat-file -e "HEAD:$p" 2>/dev/null; then
      info "  BACK IN TREE: $p (recorded as deliberately deleted, now present)"
      bad=$((bad + 1))
    fi
  done < <(json_section_paths deletedByFork)
  info "  recorded lists: kept $kept / deleted $deleted; violations: $bad"
  [ "$bad" = "0" ]
}

root_version() {
  sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' package.json | head -1
}

latest_upstream_tag() {
  git tag --list 'dsh-v*' --merged "$1" --sort=-v:refname | head -1
}

count_lines() {
  local n
  n=$(printf '%s\n' "$1" | grep -c . || true)
  printf '%s\n' "${n:-0}"
}

ensure_upstream() {
  if ! git remote get-url upstream >/dev/null 2>&1; then
    info "adding upstream remote"
    git remote add upstream "$UPSTREAM_URL"
  fi
  local url
  url=$(git remote get-url upstream)
  case "$url" in
    *deepseek-harness.git*) ;;
    *) die "upstream points at '$url', not $UPSTREAM_URL" ;;
  esac
  if [ "$(git config --get remote.upstream.pushurl || true)" != "DISABLED" ]; then
    git remote set-url --push upstream DISABLED
    info "upstream push URL pinned to DISABLED (read-only source)"
  fi
}

current_branch() {
  local b
  b=$(git branch --show-current)
  [ -n "$b" ] || die "detached HEAD; check out the development branch first"
  printf '%s\n' "$b"
}

fetch_upstream() {
  info "fetching upstream (branches + tags, pruned)"
  if net_git fetch upstream --tags --prune; then
    :
  else
    info "first fetch failed; retrying once through the local proxy"
    SYNC_GIT_PROXY="${SYNC_GIT_PROXY:-http://127.0.0.1:7897}" \
      net_git fetch upstream --tags --prune \
      || die "fetch failed twice; stopping instead of merging on stale refs"
  fi

  # Repositories that keep binaries in LFS need one explicit object fetch,
  # otherwise the merge compares pointers with real files and "conflicts" on
  # content nobody changed. Requested once per run, never assumed.
  if [ -f .gitattributes ] && grep -q 'filter=lfs' .gitattributes; then
    if git lfs version >/dev/null 2>&1; then
      info "fetching upstream LFS objects"
      net_git lfs fetch upstream >/dev/null 2>&1 \
        || info "  note: no LFS objects fetched from upstream (nothing tracked, or already present)"
    else
      info "  WARNING: .gitattributes declares LFS but git-lfs is not installed"
    fi
  else
    info "no LFS attributes here: upstream LFS fetch not needed"
  fi
}

# path<TAB>blob for every file of a ref, in one pass. Never rev-parse per path:
# the trees are ~15k files and that turns a two-second check into minutes.
tree_blobs() {
  git -c core.quotepath=false ls-tree -r "$1" \
    | awk -F'\t' '{ split($1, m, " "); print $2 "\t" m[3] }'
}

# --------------------------------------------------------------------------
cmd_status() {
  ensure_upstream
  local branch anchor tip behind remote_origin tag
  branch=$(current_branch)
  anchor=$(anchor_sha)
  tip=$(git rev-parse --verify -q "upstream/$UPSTREAM_BRANCH" || true)
  behind=$(git rev-list --count "HEAD..upstream/$UPSTREAM_BRANCH" 2>/dev/null || echo "?")
  remote_origin=$(remote_sha origin "refs/heads/$branch")
  tag=$(latest_upstream_tag "upstream/$UPSTREAM_BRANCH" 2>/dev/null || true)

  kv "branch" "$branch @ $(git rev-parse --short HEAD)"
  kv "anchor (last synced)" "${anchor:-<none>}"
  kv "upstream/$UPSTREAM_BRANCH tip" "${tip:-<not fetched>}"
  kv "newest upstream tag" "${tag:-<none>}"
  kv "origin/$branch" "${remote_origin:-<unknown>}"
  kv "commits to merge" "$behind"
  if [ -n "$tip" ] && [ "$anchor" = "$tip" ]; then
    kv "verdict" "ALREADY CURRENT (anchor == upstream tip)"
  elif [ -n "$tip" ]; then
    local base
    base=$(git merge-base HEAD "upstream/$UPSTREAM_BRANCH")
    kv "merge-base" "$(git rev-parse --short "$base")"
    [ -z "$anchor" ] || [ "$base" = "$anchor" ] || \
      kv "WARNING" "merge-base != anchor (upstream history rewrite?)"
    kv "verdict" "SYNC NEEDED"
  fi
  print_lists
}

# --------------------------------------------------------------------------
cmd_prepare() {
  ensure_upstream
  local branch head_sha remote_origin dirty stamp
  branch=$(current_branch)
  head_sha=$(git rev-parse HEAD)

  dirty=$(git status --porcelain)
  if [ -n "$dirty" ]; then
    printf '%s\n' "$dirty" | head -20 >&2
    die "working tree is dirty ($(count_lines "$dirty") paths). Commit first; never merge on a dirty tree, and do not git clean."
  fi
  if [ -n "$(git stash list)" ]; then
    info "note: stash entries exist and are left untouched:"
    git stash list | head -5
  fi

  remote_origin=$(remote_sha origin "refs/heads/$branch")
  [ -n "$remote_origin" ] || die "origin/$branch not found (missing ref or network failure)"
  if [ "$remote_origin" != "$head_sha" ]; then
    die "origin/$branch is $remote_origin but HEAD is $head_sha ($(git rev-list --count "origin/$branch..HEAD" 2>/dev/null || echo "?") local commit(s) unpublished). Push and confirm before syncing."
  fi
  info "origin/$branch confirmed : $remote_origin (== HEAD, nothing unpublished)"

  stamp=$(date +%Y%m%d-%H%M%S)
  git tag -f "backup/pre-sync-$stamp" HEAD >/dev/null
  git tag -f "$ROLLING_BACKUP" HEAD >/dev/null
  info "rollback point           : tag backup/pre-sync-$stamp ($(git rev-parse --short HEAD))"

  rule
  info "curated divergence lists, read before adjudicating any conflict:"
  print_lists
  if ! check_lists; then
    die "the tree contradicts the recorded lists; settle that decision before syncing"
  fi

  fetch_upstream

  local tip anchor mb count
  tip=$(git rev-parse "upstream/$UPSTREAM_BRANCH")
  anchor=$(anchor_sha)
  mb=$(git merge-base HEAD "$tip")
  count=$(git rev-list --count "$mb..$tip")

  info "upstream tip fetched     : $tip ($(git log -1 --format='%ci' "$tip"))"
  info "this round's ceiling     : $tip (later upstream pushes belong to the next round)"
  info "merge-base               : $(git rev-parse --short "$mb")"
  info "anchor                   : ${anchor:-<none, merge-base is the anchor>}"
  if [ -n "$anchor" ] && [ "$anchor" != "$mb" ]; then
    info "WARNING: anchor != merge-base. That is the signature of an upstream history rewrite;"
    info "the merge step will stop and hand the decision back to you."
  fi

  if [ "$count" = "0" ]; then
    rule
    info "ALREADY CURRENT: 0 commits between the merge-base and the upstream tip ($tip)."
    info "No merge commit created (an empty merge would only pollute history)."
    if [ "$anchor" != "$tip" ]; then
      info "the anchor is stale; refresh it with: scripts/sync-upstream.sh anchor"
    fi
    exit 0
  fi

  git diff --name-only "$mb" "$tip" | LC_ALL=C sort -u > "$gitdir/sync/upstream-changed.txt"
  git diff --name-only "$mb" HEAD | LC_ALL=C sort -u > "$gitdir/sync/fork-changed.txt"
  LC_ALL=C comm -12 "$gitdir/sync/upstream-changed.txt" "$gitdir/sync/fork-changed.txt" \
    > "$gitdir/sync/overlap.txt"

  local files overlap
  files=$(wc -l < "$gitdir/sync/upstream-changed.txt" | tr -d ' ')
  overlap=$(wc -l < "$gitdir/sync/overlap.txt" | tr -d ' ')

  rule
  info "scope: $count upstream commit(s), $files changed path(s), $overlap also changed here"
  info "top directories touched:"
  git diff --name-only "$mb" "$tip" \
    | awk -F/ '{ if (NF == 1) print "(root) " $1; else print $1 "/" $2 }' \
    | sort | uniq -c | sort -rn | head -12

  info "fork surfaces inside the overlap (brand / sdkwork / sync tooling):"
  grep -E 'sdkwork|^FORK_SYNC\.|^bin/|^\.sdkwork/|ui-primitives/src/(Bird|Fish)Logo\.tsx|apps/desktop/src/locale\.ts|^scripts/sync-upstream\.sh$' \
    "$gitdir/sync/overlap.txt" | head -20 || true

  local big=0
  [ "$count" -gt "$LARGE_COMMITS" ] && big=1
  [ "$files" -gt "$LARGE_FILES" ] && big=1
  if [ "$big" = "1" ] && [ "${SYNC_ALLOW_LARGE:-0}" != "1" ]; then
    rule
    info "DECISION NEEDED: this range is large ($count commits / $files paths)."
    info "Choose one, then re-run the same command:"
    info "  1) merge it as one range: SYNC_ALLOW_LARGE=1 scripts/sync-upstream.sh prepare"
    info "  2) merge it in per-directory batches (prepare / merge / verify / anchor per batch)"
    info "full lists: $gitdir/sync/upstream-changed.txt and $gitdir/sync/overlap.txt"
    exit 2
  fi

  rule
  info "SYNC READY: $count upstream commit(s) from $(git rev-parse --short "$mb") to $tip."
  info "next: scripts/sync-upstream.sh merge"
}

# --------------------------------------------------------------------------
cmd_merge() {
  [ ! -f "$gitdir/MERGE_HEAD" ] || die "a merge is already in progress; finish or abort it first"
  local dirty tip anchor mb
  dirty=$(git status --porcelain)
  [ -z "$dirty" ] || die "working tree is dirty; commit first"

  tip=$(git rev-parse "upstream/$UPSTREAM_BRANCH")
  anchor=$(anchor_sha)
  mb=$(git merge-base HEAD "$tip")
  if [ -n "$anchor" ] && [ "$anchor" != "$mb" ]; then
    rule
    info "STOP: merge-base is $(git rev-parse --short "$mb") but the anchor says $(git rev-parse --short "$anchor")."
    info "That is the signature of an upstream history rewrite (force-push or rerun)."
    info "Do not hard-merge. Decide first: keep this history, or rebuild the fork layer on"
    info "top of upstream. Commits in the anchor..tip range:"
    git log --oneline "$anchor..$tip" | head -20
    exit 4
  fi

  info "merging upstream/$UPSTREAM_BRANCH ($tip) with --no-ff --no-commit (zdiff3)"
  if git -c merge.conflictStyle=zdiff3 -c merge.renameLimit="$RENAME_LIMIT" \
      -c diff.renameLimit="$RENAME_LIMIT" \
      merge --no-commit --no-ff "$tip"; then
    rule
    info "merged cleanly; nothing needed manual adjudication."
    info "review the staged tree, then commit with the standard merge message."
    return 0
  fi

  local conflicts count
  conflicts="$gitdir/sync/conflicts.txt"
  git diff --name-only --diff-filter=U | LC_ALL=C sort > "$conflicts"
  count=$(wc -l < "$conflicts" | tr -d ' ')

  rule
  info "conflicts: $count file(s); list in $conflicts"
  info "adjudicate per file, not per tree:"
  info "  fork surfaces (brand, sdkwork, plugins, routing, vendor)  -> keep this repository's version"
  info "  upstream core behavior                                    -> take upstream"
  info "  both sides changed the same surface                       -> merge both behaviors, upstream structure as the baseline"
  info "  upstream deleted / fork modified                          -> decide per file and record the outcome"
  info "never git checkout --ours/--theirs on a whole tree, never git merge -X ours/-X theirs,"
  info "never git rm or rm -rf to make a conflict disappear."
  if [ "$count" -gt "$MAX_CONFLICTS" ]; then
    rule
    info "DECISION NEEDED: $count conflicts (threshold $MAX_CONFLICTS). The merge is left"
    info "staged and unresolved on purpose. Options:"
    info "  1) keep resolving by hand, file by file"
    info "  2) resolve directory by directory, committing each batch"
    info "  3) rebuild the fork layer on top of upstream as the baseline"
    exit 3
  fi
  info "next: resolve, git add the resolved paths, then scripts/sync-upstream.sh verify"
}

# --------------------------------------------------------------------------
cmd_verify() {
  local failures=0
  check() {
    if [ "$2" = "1" ]; then info "  PASS  $1"; else info "  FAIL  $1"; failures=$((failures + 1)); fi
  }

  rule
  info "1) upstream fully contained"
  if git merge-base --is-ancestor "upstream/$UPSTREAM_BRANCH" HEAD; then
    check "upstream tip is an ancestor of HEAD" 1
  else
    check "upstream tip is an ancestor of HEAD" 0
  fi
  local behind
  behind=$(git rev-list --count "HEAD..upstream/$UPSTREAM_BRANCH")
  info "  commits upstream has that HEAD lacks: $behind"
  if [ "$behind" = "0" ]; then check "no upstream commit is missing" 1; else check "no upstream commit is missing" 0; fi

  info "2) no conflict residue"
  local markers unmerged
  markers=$({ git grep -l -E '^(<<<<<<< |>>>>>>> |\|\|\|\|\|\|\| )' -- . 2>/dev/null || true; } | wc -l | tr -d ' ')
  unmerged=$(git diff --name-only --diff-filter=U | wc -l | tr -d ' ')
  info "  files with conflict markers: $markers; unmerged index entries: $unmerged"
  if [ "$markers" = "0" ] && [ "$unmerged" = "0" ]; then
    check "no conflict markers and no unmerged entries" 1
  else
    check "no conflict markers and no unmerged entries" 0
  fi

  info "3) deletion audit against $ROLLING_BACKUP"
  local backup deleted still f
  backup=$(git rev-parse --verify -q "refs/tags/$ROLLING_BACKUP" || true)
  if [ -n "$backup" ]; then
    deleted=$(git diff --diff-filter=D --name-only "$backup" HEAD)
    info "  paths removed since the rollback point: $(count_lines "$deleted")"
    still=""
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      if git cat-file -e "upstream/$UPSTREAM_BRANCH:$f" 2>/dev/null; then
        still="$still$f"$'\n'
      fi
    done <<< "$deleted"
    if [ -n "$still" ]; then
      info "  STILL-UPSTREAM (possible mistake):"
      printf '%s' "$still" | sed 's/^/    /'
      check "no file vanished that upstream still has" 0
    else
      check "no file vanished that upstream still has" 1
    fi
  else
    info "  no $ROLLING_BACKUP tag; skipped (run prepare first)"
  fi

  # The decisive check. Every other check looks at what the fork touched; this
  # one looks at what it never touched. A file whose only source of change was
  # upstream must be identical to upstream in the merge result. Anything else
  # means content was silently swallowed, which is exactly what a per-file
  # conflict review cannot see.
  info "4) upstream-owned content the fork never touched: must equal upstream"
  local merge ups base audit stats compared dropped remains hh mm p
  merge=$(anchor_field lastMergeCommit)
  ups=$(git rev-parse --verify -q "upstream/$UPSTREAM_BRANCH" || echo "")
  [ -n "$merge" ] || merge=$(git rev-parse HEAD)
  if [ -z "$(git rev-parse --verify -q "$merge^2" || echo "")" ] || \
     [ "$(git rev-parse "$merge^2" 2>/dev/null || echo "")" != "$ups" ]; then
    local c
    for c in $(git rev-list --merges -20 HEAD); do
      if [ "$(git rev-parse "$c^2" 2>/dev/null || echo "")" = "$ups" ]; then merge=$c; break; fi
    done
  fi
  if [ -n "$ups" ] && [ -n "$(git rev-parse --verify -q "$merge^2" || echo "")" ]; then
    base=$(git merge-base "$merge^1" "$ups")
    mkdir -p "$gitdir/sync/fidelity"
    tree_blobs "$merge"   > "$gitdir/sync/fidelity/merged.tsv"
    tree_blobs "$merge^1" > "$gitdir/sync/fidelity/forkpre.tsv"
    tree_blobs "$ups"     > "$gitdir/sync/fidelity/upstream.tsv"
    tree_blobs "$base"    > "$gitdir/sync/fidelity/base.tsv"
    audit=$(awk -F'\t' '
      FILENAME == ARGV[1] { m[$1] = $2; next }
      FILENAME == ARGV[2] { f[$1] = $2; next }
      FILENAME == ARGV[3] { u[$1] = $2; next }
      FILENAME == ARGV[4] { b[$1] = $2; next }
      END {
        n = 0
        for (p in u) {
          if ((p in f) != (p in b)) continue   # fork re-added or removed it: adjudicated elsewhere
          if (f[p] != b[p]) continue           # fork touched it: its own divergence
          n++
          if (m[p] == u[p]) continue           # survived exactly as upstream wrote it
          if (!(p in m)) print "DROPPED\t" p "\tremoved by the merge"
          else print "DROPPED\t" p "\tcontent differs from upstream"
        }
        print "STATS\t" n "\t0"
      }
    ' "$gitdir/sync/fidelity/merged.tsv" "$gitdir/sync/fidelity/forkpre.tsv" \
      "$gitdir/sync/fidelity/upstream.tsv" "$gitdir/sync/fidelity/base.tsv")
    stats=$(printf '%s\n' "$audit" | grep '^STATS' || true)
    compared=$(printf '%s\n' "$stats" | cut -f2)
    dropped=$(printf '%s\n' "$audit" | grep '^DROPPED' || true)
    info "  files the fork never touched in this merge ($(git rev-parse --short "$merge")): ${compared:-0}"
    remains=0
    if [ -z "$dropped" ]; then
      info "  diverged from upstream: 0"
    else
      info "  diverged from upstream:"
      printf '%s\n' "$dropped" | cut -f2,3 | sed 's/^/    /'
      while IFS=$'\t' read -r _ p _; do
        [ -n "$p" ] || continue
        hh=$(git rev-parse --verify -q "HEAD:$p" || echo "")
        mm=$(git rev-parse --verify -q "$merge:$p" || echo "")
        if [ -n "$hh" ] && [ "$hh" != "$mm" ]; then
          info "    repaired after the merge in HEAD: $p"
        else
          remains=$((remains + 1))
        fi
      done <<< "$dropped"
    fi
    if [ "$remains" = "0" ]; then
      check "every upstream-owned file the fork never touched is byte-identical" 1
    else
      check "every upstream-owned file the fork never touched is byte-identical" 0
    fi
  else
    info "  skipped: no merge commit whose second parent is upstream/$UPSTREAM_BRANCH"
  fi

  info "5) fork surfaces are still the local ones: brand contract"
  local fish bird slot win brand_copy
  fish=$(git grep -l "FishLogo" -- packages/client 2>/dev/null | grep '\.tsx$' | grep -v '^packages/client/ui-primitives/' || true)
  bird=$(git grep -l "BirdLogo" -- packages/client 2>/dev/null | grep '\.tsx$' || true)
  slot=$({ git grep -c "return <BirdWordmark />" -- packages/client/ui-brand-official/src/client/Brand.tsx 2>/dev/null || true; } | awk -F: '{s+=$2} END{print s+0}')
  win=$({ git grep -c "resolveWindowIcon(app.getAppPath())" -- apps/desktop/src/main.ts 2>/dev/null || true; } | awk -F: '{s+=$2} END{print s+0}')
  brand_copy=$({ git grep -l "DeepSeek Harness" -- apps/desktop/src/locale.ts 2>/dev/null || true; } | wc -l | tr -d ' ')
  info "  FishLogo call sites outside ui-primitives: ${fish:-none}"
  info "  BirdLogo consumers: $(count_lines "$bird")"
  info "  BirdWordmark in the official name slot: $slot (expect 1)"
  info "  desktop window icon: $win (expect 1); upstream name in desktop copy: $brand_copy (expect 0)"
  if [ -z "$fish" ] && [ -n "$bird" ] && [ "$slot" = "1" ] && [ "$win" = "1" ] && [ "$brand_copy" = "0" ]; then
    check "fork brand surfaces are still the local ones" 1
  else
    check "fork brand surfaces are still the local ones" 0
  fi

  info "5b) sdkwork surfaces intact"
  if [ -n "$backup" ]; then
    local before after
    before=$(git ls-tree -r --name-only "$backup" | grep -c 'sdkwork' || true)
    after=$(git ls-tree -r --name-only HEAD | grep -c 'sdkwork' || true)
    info "  tracked sdkwork paths: $before -> $after"
    if [ "$after" -ge "$before" ]; then check "sdkwork surfaces did not shrink" 1; else check "sdkwork surfaces did not shrink" 0; fi
  else
    info "  skipped (no rollback tag)"
  fi

  info "6) release bookkeeping (version family + CHANGELOG)"
  local ver tagv first
  ver=$(root_version)
  tagv=$(latest_upstream_tag "upstream/$UPSTREAM_BRANCH" | sed 's/^dsh-v//')
  first=$(sed -n 's/^## \([^（( ]*\).*/\1/p' CHANGELOG.md | head -1)
  info "  root package.json: $ver; newest upstream tag: $tagv; CHANGELOG first heading: $first"
  if [ -n "$tagv" ] && [ "$ver" = "$tagv" ]; then check "root version matches the newest upstream tag" 1; else check "root version matches the newest upstream tag" 0; fi
  case "$first" in
    *"$ver"*) check "CHANGELOG documents the current version" 1 ;;
    *) check "CHANGELOG documents the current version" 0 ;;
  esac

  info "7) curated kept/deleted lists still describe the tree"
  local anchor declined
  anchor=$(anchor_sha)
  declined=""
  if [ -n "$anchor" ]; then
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      git cat-file -e "HEAD:$f" 2>/dev/null && declined="$declined$f"$'\n'
    done < <(git diff --diff-filter=D --name-only "$anchor" "upstream/$UPSTREAM_BRANCH")
  fi
  if [ -n "$declined" ]; then
    info "  upstream deleted these in this range while the fork still ships them:"
    printf '%s' "$declined" | sed 's/^/    /'
    info "  each must be recorded in keptByFork: record the decision, or follow the deletion"
  else
    info "  upstream deleted nothing in this range that the fork still ships"
  fi
  if check_lists; then
    check "recorded kept/deleted lists match the tree" 1
  else
    check "recorded kept/deleted lists match the tree" 0
  fi

  rule
  if [ "$failures" = "0" ]; then
    info "VERIFY PASSED. next: scripts/sync-upstream.sh anchor"
  else
    info "VERIFY FAILED: $failures check(s). Fix before recording the anchor."
    exit 1
  fi
}

# --------------------------------------------------------------------------
cmd_anchor() {
  cmd_verify
  local tip merge tag now c
  tip=$(git rev-parse "upstream/$UPSTREAM_BRANCH")
  # The anchor points at the merge commit whose second parent is this upstream
  # tip; if the tip arrived through an older merge (or a follow-up commit moved
  # HEAD), keep that merge rather than recording a non-merge HEAD.
  merge=""
  for c in $(git rev-list --merges -20 HEAD); do
    if [ "$(git rev-parse "$c^2" 2>/dev/null || true)" = "$tip" ]; then
      merge=$c
      break
    fi
  done
  [ -n "$merge" ] || merge=$(git rev-parse HEAD)
  tag=$(latest_upstream_tag "$tip")
  now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  # Keep the curated lists exactly as recorded: only the five sync fields are
  # rewritten, so a new round cannot quietly drop a decision an earlier round
  # already made. `lists` is how those lists get extended, deliberately.
  {
    printf '{\n'
    printf '%s\n' '  "$comment": "Upstream sync anchor. Written by scripts/sync-upstream.sh anchor; commit it with the merge so the next incremental sync starts here.",'
    printf '  "upstream": "%s",\n' "$UPSTREAM_URL"
    printf '  "branch": "%s",\n' "$UPSTREAM_BRANCH"
    printf '  "lastSyncedSha": "%s",\n' "$tip"
    printf '  "lastSyncedTag": "%s",\n' "$tag"
    printf '  "lastMergeCommit": "%s",\n' "$merge"
    printf '  "recordedAt": "%s",\n' "$now"
    if [ -f "$ANCHOR_FILE" ] && grep -q '^  "keptByFork": \[' "$ANCHOR_FILE"; then
      sed -n '/^  "keptByFork": \[/,$p' "$ANCHOR_FILE"
    else
      printf '  "keptByFork": [],\n'
      printf '  "deletedByFork": []\n'
      printf '}\n'
    fi
  } > "$ANCHOR_FILE.tmp"
  mv "$ANCHOR_FILE.tmp" "$ANCHOR_FILE"

  # Local-only retrospective tag: <sha7>-<date> names the round, so a later
  # investigation can go straight from "which sync brought this in" to the
  # merge commit. Deliberately not pushed: upstream release tags stay local too.
  local sha7 stamp
  sha7=$(printf '%s' "$tip" | cut -c1-7)
  stamp=$(date +%Y%m%d)
  git tag -f "sync/upstream-$sha7-$stamp" "$merge" >/dev/null
  rule
  info "anchor written: $ANCHOR_FILE -> $tip ($tag)"
  info "sync tag       : sync/upstream-$sha7-$stamp -> $(git rev-parse --short "$merge")"
  info "commit it: git add $ANCHOR_FILE && git commit -m \"chore(sync): advance the upstream anchor to $tag\""
}

# --------------------------------------------------------------------------
# Re-derive both candidate lists from git and diff them against what the anchor
# records. Read-only: it never edits the record. A path reported as UNRECORDED
# is a decision the next merge would otherwise re-litigate from scratch, and a
# RECORDED-but-not-divergent line is a stale entry worth retiring.
cmd_lists() {
  ensure_upstream
  local ups tmp
  ups=$(git rev-parse --verify -q "upstream/$UPSTREAM_BRANCH" || echo "")
  [ -n "$ups" ] || die "upstream/$UPSTREAM_BRANCH is not fetched; run 'prepare' (or 'fetch') first"
  tmp="$gitdir/sync"
  mkdir -p "$tmp"

  git -c core.quotepath=false ls-tree -r --name-only "$ups" | LC_ALL=C sort > "$tmp/list-up.txt"
  git -c core.quotepath=false ls-tree -r --name-only HEAD  | LC_ALL=C sort > "$tmp/list-head.txt"

  # (a) upstream ships it, the fork does not -> candidates for deletedByFork
  LC_ALL=C comm -23 "$tmp/list-up.txt" "$tmp/list-head.txt" > "$tmp/list-cand-deleted.txt"
  # (b) upstream deleted it somewhere in its history and never re-added it,
  #     while the fork still ships it -> candidates for keptByFork
  git -c core.quotepath=false log --diff-filter=D --name-only --no-renames --pretty=format: "$ups" \
    | grep -v '^$' | LC_ALL=C sort -u > "$tmp/list-up-deleted-hist.txt"
  LC_ALL=C comm -23 "$tmp/list-head.txt" "$tmp/list-up.txt" > "$tmp/list-fork-only.txt"
  LC_ALL=C comm -12 "$tmp/list-fork-only.txt" "$tmp/list-up-deleted-hist.txt" > "$tmp/list-cand-kept.txt"

  json_section_paths keptByFork    | LC_ALL=C sort > "$tmp/list-rec-kept.txt"
  json_section_paths deletedByFork | LC_ALL=C sort > "$tmp/list-rec-deleted.txt"

  rule
  info "candidates derived from git (upstream tip $(git rev-parse --short "$ups"))"
  kv "kept candidates" "$(wc -l < "$tmp/list-cand-kept.txt" | tr -d ' ')"
  kv "deleted candidates" "$(wc -l < "$tmp/list-cand-deleted.txt" | tr -d ' ')"
  kv "recorded this round" "kept $(list_count keptByFork) / deleted $(list_count deletedByFork)"

  rule
  info "kept candidates the record does not cover (a directory entry ending in / covers its subtree):"
  awk -F'\t' '
    NR == FNR { if ($0 ~ /\/$/) dir[++n] = $0; else fil[$0] = 1; next }
    {
      p = $0; ok = 0
      if (p in fil) ok = 1
      else for (i = 1; i <= n; i++) if (index(p, dir[i]) == 1) { ok = 1; break }
      if (!ok) { print "  UNRECORDED  " p; miss++ }
    }
    END { if (miss) print "  (" miss " unrecorded kept candidate(s))" }
  ' "$tmp/list-rec-kept.txt" "$tmp/list-cand-kept.txt"

  rule
  info "deleted candidates the record does not cover:"
  if LC_ALL=C comm -23 "$tmp/list-cand-deleted.txt" "$tmp/list-rec-deleted.txt" | sed 's/^/  UNRECORDED  /' | grep . ; then
    :
  else
    info "  none"
  fi

  rule
  info "recorded deleted entries that no longer diverge (retire them):"
  if LC_ALL=C comm -13 "$tmp/list-cand-deleted.txt" "$tmp/list-rec-deleted.txt" | sed 's/^/  STALE       /' | grep . ; then
    :
  else
    info "  none"
  fi

  rule
  info "lists: git candidates are in $tmp/list-cand-*.txt"
  info "extend .sdkwork/upstream-sync-anchor.json by hand, with a reason per entry."
}

# --------------------------------------------------------------------------
case "${1:-status}" in
  status)  cmd_status ;;
  prepare) cmd_prepare ;;
  merge)   cmd_merge ;;
  verify)  cmd_verify ;;
  anchor)  cmd_anchor ;;
  lists)   cmd_lists ;;
  fetch)   ensure_upstream; fetch_upstream ;;
  *) die "unknown command '$1' (status|prepare|merge|verify|anchor|lists|fetch)" ;;
esac
