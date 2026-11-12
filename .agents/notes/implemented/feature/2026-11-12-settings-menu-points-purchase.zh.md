# Agent Note：从设置菜单钱包卡购买积分

Status: implemented

[English](2026-11-12-settings-menu-points-purchase.md) | 中文

## Problem

设置菜单的钱包卡（`settings.menu.plan`，Token Plan 插件的账号卡）渲染了两个操作：升级套餐与购买积分，但两者做的是同一件事——收起菜单并把主框架切到 Token Plan 模式。目录页确实提供了充值入口，但用户要求在刚看过余额的地方完成购买：点击弹出菜单里的「购买积分」必须直接弹出购买弹窗，而且购买完成后显示的余额必须是结算后的数字，而不是购买前的快照。

真正让这件事不只是接线问题的，是弹出菜单本身：`SubmenuMenu` 渲染的是 `open && (…)`，因此每条关闭路径——指针离开宽限期、Escape、外部点击、选中行——都会把整个菜单子树卸载。渲染在卡内的购买弹窗会被任何一次菜单收起连带卸载，而用户伸手去够弹窗的那一刻指针一离开，菜单就会自己关闭。

## Decision

购买界面是设置外壳拥有的席位，而不是卡内内容：

- **`settings.pointsRecharge`** 是新的根作用域功能弹窗席位：类型与其他根作用域功能弹窗一起声明在 `ui-settings`，运行时由 `ui-sdkwork-settings-menu` 的 `mode.rail.settings` 条目授权。其 owner 份额是 `{ open, onClose }`；外壳用组件本地状态持有可见性，并把该席位渲染在设置面板旁边、弹出菜单之外，因此弹窗比请它出现的菜单活得更久。
- **卡面多了一个 affordance。** `SettingsMenuPlanOwnerProps` 增加 `openPointsRecharge`：钱包卡沿用既有 `close` 份额收起菜单，然后请外壳打开弹窗。升级套餐保持原行为，仍然打开该模式。
- **Token Plan 插件提供弹窗本身。** `PointsRechargeDialog` 渲染 Order 拥有的 `SdkworkPointsRechargeDialog`，并使用与目录页宿主组件相同的文案投影（`recharge-copy.ts`），两个表面因此不会各自漂移。组件仅在打开时挂载：它在打开手势里解析充值端口并读取钱包；没有 API 环境的部署上该端口是 `undefined`，弹窗以 `page.unconfigured` 说明情况，而不是在无法构造的服务上崩溃。
- **结算后重读余额。** Order 弹窗会把支付轮询到 `completed` 并回调宿主的 `onCompleted`；宿主此时重读钱包，弹窗头部的数字因此是入账后的余额。两个表面都不缓存这个数字——弹出菜单每次挂载卡面都会重读钱包——所以下次打开菜单看到的仍是同一个结算后余额。
- **`pointsRechargeTheme.css` 原样复用。** 该弹窗按 `body[data-ds-dark-theme]` 翻转的 `--dsw-*` 别名取色，因此跟随应用外观，不需要 `SdkworkThemeProvider` 包装，也不会从第二个表面去改文档根节点。

## Alternatives considered

**把弹窗渲染在钱包卡内部。** 接线最省事，但是错的：弹出菜单的每条关闭路径都会卸载内容，而且指针一移向弹窗就会触发离开宽限期，正在扫码的支付会当场消失。

**弹窗打开期间让弹出菜单保持存活。** 菜单的 owner 是外壳，卡面无法否决它的收起；即便去掉 `closeOnPointerLeave`、再压住菜单的文档级外部点击监听，点击弹窗内部仍会收起下层的菜单，弹窗照样被卸载。

**跳到 Token Plan 模式并打开目录页自带的充值弹窗。** 这是卡面原来的行为：用「切模式 + 再点一次」回答「购买」，丢失了弹出菜单的上下文，并让用户离开设置表面进入整页目录；用户要求的是就地购买。

**让侧栏入口持有弹窗（usage-billing 仪表盘的做法）。** `ui-sdkwork-token-plan` 的侧栏入口始终挂载，用量卡打开仪表盘也证明了常驻兄弟节点可以承载弹窗。但侧栏入口是模式按钮，把 commerce 状态挂在它上面会让弹窗生命周期依赖一个不相干的席位；设置外壳本来就拥有六个由弹出菜单行打开的根作用域功能弹窗，这里的对应关系完全相同。

**在新组件里复制充值文案。** 那是一份 23 个语言键的映射，一旦键名改动副本就会漂移；共享的内部投影让目录弹窗与设置弹窗读同一份词典。

## Consequences

- 设置外壳多了一个状态位、一个关闭回调、一个渲染点和 owner 份额的一个成员；忽略 `openPointsRecharge` 的 `settings.menu.plan` 注册方仍然能编译、能运行。
- Token Plan 插件多了 `PointsRechargeDialog.tsx` 与 `recharge-copy.ts`，`commerce-components.tsx` 改为消费共享投影，不再自带那份内联文案表。
- 购买弹窗的余额读取复用 `readAccountSummary()`，与卡面同一个读取器，因此弹窗头部与卡面的数字天然一致（每次打开两次网关读取，即卡面原本的成本）。
- 弹窗打开时菜单仍然会收起：屏幕上只有弹窗，这正是支付流程想要的。

## Testing

`settings-menu-root.client.spec.tsx` 钉住席位契约：外壳以关闭态渲染 `settings.pointsRecharge`，钱包卡的 owner 份额把它打开，其 `onClose` 再关上。`settings-menu-plan-card.client.spec.tsx` 钉住两个操作的分离：升级套餐先收起再打开模式，购买积分先收起再打开购买弹窗且绝不导航。`points-recharge-dialog.client.spec.tsx` 用桩替 Order 弹窗钉住宿主契约（关闭时不渲染也不读取、余额进入头部、结算后重读、读取失败或无余额时保留占位、没有 API 环境时显示未配置提示）。`points-recharge-dialog.real.client.spec.tsx` 通过包装层渲染真实的 Order 弹窗，断言本地化标题、钱包数字、充值须知与空套餐名录。`apply.client.spec.ts` 断言注册项，以及延迟且失败安全的端口。
