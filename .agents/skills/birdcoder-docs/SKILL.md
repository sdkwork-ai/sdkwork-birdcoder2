---
name: birdcoder-docs
description: Use when writing or updating documentation for a code change — READMEs, guides, API references, and code comments — including deciding where a fact belongs and keeping prose concrete and current.
---

# Documentation

Make the docs match the code, in the reader's order.

## Workflow

1. Identify the reader (user, contributor, maintainer) and the smallest doc that serves them; one fact gets one home.
2. Update docs in the same change as the code — a shipped behavior without docs is an unfinished change.
3. Write concrete, current-state prose: complete contracts, no reasoning transcripts, no metaphors; one paragraph per physical line where the repo's standard requires it.
4. Keep code examples runnable and references valid; dead links and stale snippets are defects.
5. Run the repository's documentation checks when they exist and report the result.

## Scope rule

If a fact needs more than its surrounding section, the structure is wrong — restructure before adding elsewhere.
