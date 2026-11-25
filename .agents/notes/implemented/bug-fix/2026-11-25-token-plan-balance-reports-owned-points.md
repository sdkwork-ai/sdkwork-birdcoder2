# Agent Note: Token Plan balance surfaces report owned points

Status: implemented

English | [中文](2026-11-25-token-plan-balance-reports-owned-points.zh.md)

## Problem

The settings-menu wallet card (积分余额) and the points dialogs rendered `availableAmount` from `GET /app/v3/api/token_bank/account`. The gateway precharges every model call by moving the reservation from `availableAmount` into `frozenAmount` and returning the unused remainder at settlement, so the spendable figure drops when a call starts and comes back when it ends. In production, one account sampled 41.30, then 24.66, then 41.16 spendable points within twenty seconds while `availableAmount + frozenAmount` stayed at 74.5; the next menu open reported whatever the in-flight precharges happened to be at that instant. Nothing was spent, but every refresh looked like the balance changed.

A second defect sat under the same label: the `套餐与积分` settings section read the Membership `points.balance` / `points.history` asset, a different account from the Token Bank wallet the card and the purchase dialog report. For that account the Membership points asset was zero and its ledger empty, so the settings page and the menu card could not agree, and the package README had recorded the mismatch as deferred work.

A third defect sat in the ledger written by the account service: `append_settlement_ledger` stored the post-settlement available balance in both `balance_before` and `balance_after`, so every captured model call produced a debit row that claimed to leave the balance untouched.

## Decision

**Every balance surface reports the owned total, `availableAmount + frozenAmount`.** `computeAccountTotal` in `token-plan-service.ts` is the single derivation, used by the menu card summary, the account store that feeds the catalog and the points dialogs, and the recharge dialog header. The menu card keeps the total as the headline figure and renders the available/frozen split beside it whenever a running request holds points, so a call in flight reads as "some of it is reserved" rather than "the balance changed".

**The settings section reads the Token Bank wallet and its ledger.** `readPointsSnapshot` reads `/token_bank/account` for the total and split and `/token_bank/ledger_entries` for recent activity; no points surface reads the Membership points asset any more. Ledger rows carry unsigned micro-point amounts plus a direction, so the projection applies the sign and converts `balanceAfter`. Known business types (`gateway_invocation_billing`, `token_bank_grant`, `token_bank_purchase_credit`, `token_bank_transfer`, `token_bank_reversal`, `manual_adjustment`) get localized names with the raw wire value as the fallback.

**Settlement ledger rows record the balance pair they describe.** In `sdkwork-account`, `settlement_ledger_balances` reconstructs the pre-settlement balance as the post-settlement available balance plus the captured amount, so a capture reads as a debit from `before` to `after`.

## Alternatives considered

**Show `availableAmount` and relabel it 可用积分.** The card exists to answer "how many points do I have left", and the product copy and the settings page already call that figure 总剩余积分 / 积分余额. Relabelling makes a top-up target number vanish while a call runs and reintroduces the same confusion under a different word.

**Return a `totalAmount` field from the gateway.** That needs a schema change and a gateway release before the client can show a stable figure, while the client already receives both components and the addition is lossless at micro-point resolution. Revisit if another consumer needs the total on the wire.

**Keep the settings section on the Membership points asset and align only the card.** Two assets would remain under one label, and an account whose spend is drawn from the Token Bank wallet would still see 0 on the page.

**Include `pendingAmount` in the total.** Pending points are awaiting settlement rather than held by the owner, the gateway's own Token Bank overview sums `available + frozen`, and the settings copy already defines the total as 可用 + 冻结.

## Consequences

A model call starting or settling no longer changes the number a balance surface reports; the total only moves when a charge settles. The card gains one quiet caption while points are held, and the settings page now shows the same wallet as the card, with a real activity list for the Token Bank ledger.

The settings section performs a second request for the ledger; a ledger failure degrades to an empty activity list while the balance still renders. A frozen amount that a request never releases (until its hold expires) counts as owned, which is what the account row says until the expiry worker returns it.

The client fix reaches users only in a rebuilt bundle, and the settlement-ledger fix reaches production only in the next gateway release; the ledger defect never affected the balance reading itself, only the history's `balance_before` column.

Regression coverage: the package suite asserts the summary counts frozen points, the store shows the owned total, the card names the split while points are held, the settings snapshot reads the wallet and maps ledger directions and business types, and the account service unit test pins the settlement balance pair.
