# sdkwork-birdcoder2-app-sdk

Generated SDKWork v3 dual-token transport SDK.

## Installation

```bash
npm install @sdkwork/birdcoder2-app-sdk
# or
yarn add @sdkwork/birdcoder2-app-sdk
# or
pnpm add @sdkwork/birdcoder2-app-sdk
```

## Quick Start

```typescript
import { SdkworkBirdcoder2AppClient } from '@sdkwork/birdcoder2-app-sdk';

const client = new SdkworkBirdcoder2AppClient({
  baseUrl: 'http://localhost:18096',
  timeout: 30000,
});

// Authentication
client.setAuthToken('your-auth-token');
client.setAccessToken('your-access-token');

// Use the SDK
const params = {
  cursor: 'cursor',
  page_size: 2,
};
const result = await client.hosts.list(params);
```

## Authentication

```text
Authorization: Bearer <authToken>
Access-Token: <accessToken>
```


## Configuration (Non-Auth)

```typescript
import { SdkworkBirdcoder2AppClient } from '@sdkwork/birdcoder2-app-sdk';

const client = new SdkworkBirdcoder2AppClient({
  baseUrl: 'http://localhost:18096',
  timeout: 30000, // Request timeout in ms
  headers: {      // Custom headers
    'X-Custom-Header': 'value',
  },
});
```

## API Modules

- `client.hosts` - hosts API
- `client.agent` - agent API

## Usage Examples

### hosts

```typescript
// List the caller's hosts
const params = {
  cursor: 'cursor',
  page_size: 2,
};
const result = await client.hosts.list(params);
```

### agent

```typescript
// Get one conversation
const sessionId = '1';
const result = await client.agent.agentSessions.retrieve(sessionId);
```

## Error Handling

```typescript
import { SdkworkBirdcoder2AppClient, NetworkError, TimeoutError, AuthenticationError } from '@sdkwork/birdcoder2-app-sdk';

try {
  const params = {
    cursor: 'cursor',
    page_size: 2,
  };
  const result = await client.hosts.list(params);
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Authentication failed:', error.message);
  } else if (error instanceof TimeoutError) {
    console.error('Request timed out:', error.message);
  } else if (error instanceof NetworkError) {
    console.error('Network error:', error.message);
  } else {
    throw error;
  }
}
```

## Publishing

This SDK includes cross-platform publish scripts in `bin/`:
- `bin/publish-core.mjs`
- `bin/publish.sh`
- `bin/publish.ps1`

TypeScript check and publish commands materialize workspace dependency versions in a temporary tarball with pnpm. They reject local-only dependency protocols before npm publication and do not rewrite the source `package.json`.

### Check

```bash
./bin/publish.sh --action check
```

### Publish

```bash
./bin/publish.sh --action publish --channel release
```

```powershell
.\bin\publish.ps1 --action publish --channel test --dry-run
```

> Configure npm registry credentials before release publish.

## License

MIT

## Regeneration Contract

- HTTP/OpenAPI generator-owned files are tracked in `.sdkwork/sdkwork-generator-manifest.json`.
- HTTP/OpenAPI generation also writes `.sdkwork/sdkwork-generator-changes.json` so automation can inspect created, updated, deleted, unchanged, scaffolded, and backed-up files plus the classified impact areas, verification plan, and execution decision for the latest generation.
- HTTP/OpenAPI apply mode also writes `.sdkwork/sdkwork-generator-report.json` with the full execution report, including `schemaVersion`, `generator`, stable artifact paths, and the execution handoff commands that match CLI `--json` output.
- CLI JSON output also includes an execution handoff with concrete next commands, including reviewed apply commands for dry-run flows.
- Put HTTP/OpenAPI hand-written wrappers, adapters, and orchestration in `custom/`.
- Files scaffolded under `custom/` are created once and preserved across HTTP/OpenAPI regenerations.
- If an HTTP/OpenAPI generated-owned file was modified locally, its previous content is copied to `.sdkwork/manual-backups/` before overwrite or removal.
- RPC SDK source workspaces use convention-first evidence by default: RPC SDK family naming, language workspace naming, `rpc/*.manifest.json`, proto source references, generated client source, and native package manifests.
- Use `sdkgen inspect --protocol rpc` to verify RPC convention evidence. Request persisted generator evidence only with `--emit-control-plane` for release, CI, audit, or migration workflows; evidence paths are derived by generator convention.
