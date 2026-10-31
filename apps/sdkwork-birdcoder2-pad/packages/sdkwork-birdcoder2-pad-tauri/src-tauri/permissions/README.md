# src-tauri/permissions/

Tauri permission declarations for the tablet host.

Permissions are additive and least-privilege. They may permit host capabilities such as
file picking, sharing, clipboard, and secure storage, but they never grant business
authorization or bypass the appbase IAM runtime.

Do not add broad `allow-all` permissions. Each new permission needs an owning tablet
capability and a test that proves the unsupported or unavailable outcome when the platform
does not provide it.