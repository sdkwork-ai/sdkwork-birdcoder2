# Agent Note: Token Plan 余额界面展示账号拥有的积分

Status: implemented

[English](2026-11-25-token-plan-balance-reports-owned-points.md) | 中文

## Problem

设置菜单的钱包卡（积分余额）与积分对话框渲染的是 `GET /app/v3/api/token_bank/account` 的 `availableAmount`。网关会为每次模型调用预扣：把预扣金额从 `availableAmount` 移到 `frozenAmount`，调用结算时再退回未用完的部分；因此可用余额在请求开始时下降、请求结束时回升。在生产环境中，同一个账号在二十秒内先后读到 41.30、24.66、41.16 可用积分，而 `availableAmount + frozenAmount` 始终是 74.5；下一次打开菜单显示的数字取决于当时恰好有几笔预扣在途。并没有任何消费发生，但每次刷新看起来余额都变了。

同一标签下还有第二个缺陷：「套餐与积分」设置分区读取的是 Membership 的 `points.balance` / `points.history` 资产，与钱包卡和购买弹窗所报的 Token Bank 账户不是同一个账户。该账号的 Membership 积分资产为 0、流水为空，因此设置页与钱包卡不可能一致，本包 README 也早已把这一错配记为待办。

第三个缺陷在账号服务写入的流水里：`append_settlement_ledger` 把结算后的可用余额同时写进 `balance_before` 和 `balance_after`，导致每一笔模型调用扣费都记录成「余额未发生变化」的借方流水。

## Decision

**所有余额界面都展示账号拥有的总额，即 `availableAmount + frozenAmount`。** `token-plan-service.ts` 的 `computeAccountTotal` 是唯一的推导实现，供钱包卡摘要、为目录与积分对话框提供数据的账号 store、以及充值弹窗头部共用。钱包卡以总额为主数字，并在有在途请求冻结积分时同时展示可用/冻结拆分，于是运行中的调用读作「其中一部分被预留」，而不是「余额变了」。

**设置分区改读 Token Bank 钱包及其流水。** `readPointsSnapshot` 通过 `/token_bank/account` 读取总额与拆分，通过 `/token_bank/ledger_entries` 读取最近变动；任何积分界面都不再读取 Membership 积分资产。流水行携带无符号微积分金额与方向，投影时补上符号并换算 `balanceAfter`。已知业务类型（`gateway_invocation_billing`、`token_bank_grant`、`token_bank_purchase_credit`、`token_bank_transfer`、`token_bank_reversal`、`manual_adjustment`）使用本地化名称，其余回退为线上原始值。

**结算流水记录它所描述的余额对。** 在 `sdkwork-account` 中，`settlement_ledger_balances` 用结算后的可用余额加上本次扣取金额还原结算前余额，使一笔扣取如实呈现为从 `before` 到 `after` 的借方。

## Alternatives considered

**继续展示 `availableAmount`，只把标签改成可用积分。** 钱包卡回答的是「我还剩多少积分」，产品文案与设置页早已把这个数字称为总剩余积分 / 积分余额。改名会让充值目标数字在调用期间凭空消失，只是把同一困惑换了个词。

**由网关返回 `totalAmount`。** 这需要改 schema 并先发布网关，客户端才能展示稳定数字；而客户端已经同时拿到两个分量，在微积分精度上相加是无损的。若将来其它消费方需要线上总额，再重新考虑。

**保留设置页读 Membership 积分资产，只对齐钱包卡。** 同一个标签下仍会有两个资产，而消费从 Token Bank 钱包扣取的账号在设置页仍然看到 0。

**把 `pendingAmount` 计入总额。** 待结算积分尚未由账号持有，网关自己的 Token Bank overview 也是把 `available + frozen` 相加，且设置页文案已把总额定义为可用 + 冻结。

## Consequences

模型调用的开始或结算不再改变余额界面展示的数字；总额只在扣费结算时变化。钱包卡在有积分被冻结时多出一行安静的说明，设置页则与钱包卡展示同一个钱包，并拥有真实的 Token Bank 流水。

设置分区因此多一次流水请求；流水失败会降级为空变动列表，余额照常展示。如果某笔请求一直未释放（直到 hold 过期），其冻结积分在过期任务退回之前仍计入拥有总额，这与账号行当时的说法一致。

客户端修复只有在重新构建产物后才会到达用户，结算流水修复也只有在下一次网关发布后才会到达生产；流水缺陷本身不影响余额读取，只影响流水的 `balance_before` 列。

回归覆盖：本包测试断言摘要计入冻结积分、store 展示拥有总额、钱包卡在有冻结时展示拆分、设置快照读取钱包并映射流水方向与业务类型，账号服务的单元测试锁定结算流水的余额对。
