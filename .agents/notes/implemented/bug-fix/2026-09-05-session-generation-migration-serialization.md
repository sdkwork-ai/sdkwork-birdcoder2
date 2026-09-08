# Session historical-generation migrations run one at a time

English | [中文](2026-09-05-session-generation-migration-serialization.zh.md)

The desktop dev shell died 15–60 seconds after launch with exit code 3758096392 (`0xE0000008`),
Chromium's fatal out-of-memory exception, reproducibly and with no JS-level record: the raise
happens in the allocator, so no `uncaughtException` handler, WER event, or diag exit line runs.
The same death hit `pnpm desktop:dev` on every launch once `~/.dsh/sessions` held un-migrated
historical (v0/v1) session logs.

## Root cause

The released-format migration (`dsh-session-persistence-jsonl`) publishes a v2 successor beside
every historical log the first time a session is opened. One migration pass materializes the
whole log — decompress, parse every row, one ownership snapshot per migration edge plus source
and restoration snapshots, re-encode, validate — so its transient memory is a large multiple of
the session's decompressed size. `persistence.open()` runs that pass inline, and callers open
sessions concurrently: the desktop shell hydrates every listed session at UI load, and cold-read
ladders (for example `dsh-subagent`'s `COLD_READ_CONCURRENCY = 4`) fan out deliberately. Parallel
migrations multiply one pass's peak by the caller concurrency; with ~100 historical sessions on
this machine the desktop shell's main process climbed 0.7 GB → 10.8 GB commit within four seconds
and died. Because the crash interrupts the sweep, the next launch re-migrates the same backlog:
a launch crash loop.

An A/B/C experiment isolated the trigger to the historical-generation path: with the same code
and config, a harness home containing the historical logs crashed in 15 seconds, the same home
without `sessions/` survived, and the same home reduced to already-migrated v2 logs survived.

## Fix

`JsonlSessionPersistence.ensureCurrentLog` now serializes historical-generation migrations per
storage instance (a FIFO promise queue) and collapses concurrent opens of the same session onto
the single in-flight pass (a per-id promise map). Current-generation opens keep their
header-only fast path and never queue. Migrations are rare one-time events per session, so
serializing them bounds the process's transient migration memory at one pass without any
measurable latency cost, and every current or future bulk caller is protected at the layer that
owns the cost instead of at each call site.

A follow-up regression test opens four handles concurrently across two historical ids and one
repeated id, asserting correct restored logs, one published v2 successor per session, and no
double migration. Verified end to end: the desktop shell survives 180 seconds against the same
`~/.dsh` that previously killed it within 60, main-process commit peaks at ~860 MB, and the
historical backlog drains across launches.

## Upstream note

The migration machinery arrived with upstream deepseek-harness 0.1.3-alpha.1 (released-format
migration, v1→v2 chunk migration, v2 snapshot rollout). The defect is invisible to unit tests
because every migration test opens one session; it requires many historical sessions opened
concurrently, which is exactly what a real desktop installation with a populated `~/.dsh` does
on every boot. Any deployment upgrading over an existing home with historical logs is exposed.
