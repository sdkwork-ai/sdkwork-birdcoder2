# sdks/

Application-root SDK workspaces and generator inputs (`SDK_WORKSPACE_GENERATION_SPEC.md`).

Generated output is never hand-edited. This root consumes SDKWork generated app SDKs through
injected clients; it does not fork or regenerate appbase-owned IAM, session, or tenant APIs.
