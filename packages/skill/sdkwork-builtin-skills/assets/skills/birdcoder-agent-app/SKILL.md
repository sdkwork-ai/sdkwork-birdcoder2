---
name: birdcoder-agent-app
description: Use when building applications on top of AI agents — tool definitions, agent loops, prompt composition, MCP servers, or product features that let an agent act (search, files, code execution) inside an app.
---

# Agent Application Development

Build agent-backed features where a model acts through tools, not just chats.

## Workflow

1. Define the agent's job as a loop: what it observes, which tools it may call, and what "done" looks like. Prefer the host's existing extension points over loop changes.
2. Model tools as typed, narrow operations with documented parameters; validate at the wire boundary, trust types inside the process.
3. Compose prompts from versioned, reviewable sources; never inline hidden instructions in code paths.
4. Plan what is model-visible: anything reaching a model request must be reconstructable from durable logs.
5. Test the loop deterministically: replay a recorded session before spending live API calls.

## Output

Deliver the tool/loop/prompt changes, the safety rails (approvals, timeouts), and a replay-backed test that pins the behavior.
