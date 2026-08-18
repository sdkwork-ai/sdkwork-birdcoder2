## Implement Knowledge mode navigation and SDKWork integration

1. **Complete the SDKWork host facade**
   - Extend `packages/client/sdkwork-knowledgebase` beyond the `KnowledgeView` alias with a small host-configuration function that owns SDKWork client construction and adapts BirdCoder deployment/auth/session facts to `configureKnowledgebasePcRuntime({ sdkPorts })`.
   - Build the Knowledgebase and Drive SDK clients from the shared BirdCoder API base URL and keep credentials synchronized with the existing IAM controller/session instead of introducing a second auth store.
   - Map the IAM session/context into SDKWork's `SessionSnapshot` and expose session/language subscriptions plus the existing host capabilities required by the SDKWork runtime.
   - Export the required SDKWork types and configuration entrypoint from the facade; add the necessary workspace dependencies without importing SDKWork internals directly from the UI page.

2. **Wire the facade through the `ui-knowledge` Cordis plugin**
   - Add `ui-env`, `ui-iam`, and the connection/runtime service dependencies to `ui-knowledge`'s declared client injection list, following the existing plugin registration conventions.
   - Configure the facade once during `apply()` before the keyed page can mount, using `ctx.env`, `ctx.iam`, and the connection handle/API client; register teardown-safe environment/session subscriptions so changing credentials or environment updates the SDKWork clients.
   - Keep the existing `knowledge` rail entry and keyed `mode.page` registration. The existing click path remains `KnowledgeRailEntry -> setMode('knowledge') -> LayoutState -> AppFrame -> mode.page -> KnowledgePage`; no URL router or persistence change is needed.
   - Add a stable knowledge-surface marker and mount styling through the page/facade entry so the embedded SDKWork surface fills the center column and its global styles are installed exactly once.

3. **Synchronize package/build metadata and documentation**
   - Update `ui-knowledge` and facade package descriptions/JSDoc, the Chinese README, and stale mode comments to describe the real Knowledge Base surface and its actual runtime requirements.
   - Replace the current inaccurate fallback/separate-chunk claims with the behavior implemented by the host adapter; keep the SDKWork React compatibility decision explicit in package metadata and build configuration.
   - Ensure the web bundle roster and workspace dependency graph include the SDKWork facade and the provider plugins in dependency order, while preserving the repository's named `inject`/`apply` plugin contract.

4. **Add focused behavior and composition coverage**
   - Extend the focused `ui-knowledge` tests to verify adapter configuration, SDK client/session/language wiring, and disposal/reconfiguration behavior; retain the existing rail click and keyed registration tests.
   - Update the assembled app-mode scenario to assert the current rail order and, after clicking the Knowledge icon, assert the real knowledge surface marker/content is mounted and the Code conversation is replaced. Keep existing mode-switch and collapse coverage intact.
   - Update assembled boot fixtures with the provider entries required by the new injection list and add/update one deterministic user-visible knowledge-page snapshot if the assembled SDKWork surface produces stable output.

5. **Verify the complete path**
   - Regenerate the ignored client artifacts used by assembled tests (`ui-app-modes`, `ui-layout`, `ui-knowledge`, and any dependent web bundles).
   - Run the focused `ui-knowledge`, `ui-app-modes`, `ui-layout`, and assembled web tests, then run typecheck/build/hygiene checks required for the changed package graph. Report any SDKWork-only external API limitations separately from local wiring failures.