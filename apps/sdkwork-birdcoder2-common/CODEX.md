# Codex Entry

<!-- SDKWORK-CODEX-SHIM: v1 -->

This file is a compatibility shim for Codex. The authoritative SDKWork agent entrypoint is `AGENTS.md` in this same directory.

Read in this order:

1. `AGENTS.md`
2. `../../sdkwork-specs/SOUL.md`
3. `../../sdkwork-specs/AGENTS_SPEC.md`
4. Task-specific files from `../../sdkwork-specs/README.md`

Rules for Codex:

- Do not duplicate or override SDKWork rules in `CODEX.md`.
- If `AGENTS.md` or `../../sdkwork-specs/README.md` is missing, stop and report the unresolved path.
- For code changes, follow `../../sdkwork-specs/CODE_STYLE_SPEC.md`, `../../sdkwork-specs/NAMING_SPEC.md`, and only the language/framework spec for touched files.
- Keep tool-specific behavior local to the tool; SDKWork architecture, naming, API, SDK, security, and verification rules come from `AGENTS.md` and `../../sdkwork-specs/README.md`.
