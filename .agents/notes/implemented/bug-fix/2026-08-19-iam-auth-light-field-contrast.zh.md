# Agent Note: IAM 认证浅色主题输入框对比度与二维码栏外观

Status: implemented

[English](2026-08-19-iam-auth-light-field-contrast.md) | 中文

## Problem

BirdCoder 浅色主题把 `--dsw-alias-bg-base`、`--dsw-alias-bg-layer-1`、`--dsw-alias-bg-layer-2` 和 `--dsw-alias-bg-layer-3` 塌成同一白色（`--dsw-static-neutral-bluish-00`）。IAM 登录叠加把输入框和二维码框的填充映射到这些 layer token。sdkwork 认证输入框还绘制 `border-0`，密码框带有内联 `borderWidth: 0`，因此 `fieldBorderColor` 从不显现。浅色模式下结果是白底上的白色控件：用户名和密码框实际上看不见。把 `qrFrameBackgroundColor` 映射到 `bg-layer-2` 又把同一白色涂到品牌化的深色二维码栏上，白色二维码画布周围的井消失在 shell 内边距里。

再把二维码列在两种方案下都涂成 `#09090b`，浅色模式就会出现黑色栏。sdkwork 面板是 `rounded-lg`，外壳是 `rounded-xl` 白底；深色填充加内圆角会在外壳圆角上凿出白色月牙。

客户端 bundle 只注入 CSS Module。普通 `sdkwork-auth.css` 副作用导入会被丢弃，因此放在非 module 样式表里的边框覆盖永远到不了运行中的叠加层。`slotProps` 上的 Tailwind 类名也不会生成：web 样式表的 `@source` 扫描 sdkwork 包，而不是 `ui-iam`。

## Decision

`packages/client/ui-iam/src/client/auth-appearance.ts` 按色板叠加表单列外观。浅色输入框与 oauth 卡片使用 `--dsw-alias-bg-overlay`（`bluish-150`）对照 `bg-layer-2` shell。深色输入框使用 `--dsw-alias-bg-layer-1`（比 elevated shell 深一档）。边框使用 `--dsw-alias-border-l2`。占位符使用 `--dsw-alias-label-tertiary`，因为浅色 `--dsw-alias-label-dimmed` 是近白填充而不是提示文字。

二维码列使用与对话框 shell 相同的 `bg-layer-2` 填充和主文字色。白色画布外的框是透明的（没有内凹井，也没有边框）。Aside `slotProps` 去掉 sdkwork 内边距（`padding: 0`）并让 aside 保持透明。`sdkwork-auth.module.css`（由 `SdkworkAuthThemeFrame` 导入）用 `:global` 选择器恢复 1px 输入框边框，抹平方形化二维码面板圆角，覆盖二维码 aside 内的 `bg-zinc-950` / `text-white` / `text-zinc-300` / `bg-zinc-900/70`，并在 `[data-testid="sdkwork-auth-qr-frame"]` 下保持白色画布。

这是 [IAM 认证插件 note](../feature/2026-08-16-sdkwork-iam-auth-plugin.zh.md) 所描述的 appearance 叠加中输入框与二维码外观的那一半。

## Alternatives considered

**继续把输入框映射到 `bg-layer-1`，依赖 `fieldBorderColor`。** 否决：sdkwork 输入框是 `border-0`，密码框带有内联 `borderWidth: 0`，因此边框 token 无效，且浅色 layer-1 与 shell 是同一白色。

**把浅色输入框映射到 `--dsw-alias-bg-module-platform`。** 否决：浅色 `module-platform` 是 `bluish-60`（`rgb(245, 246, 247)`），在边框覆盖缺失时与白色 shell 太接近，无法标出控件。

**两种方案都保留 sdkwork 深色二维码栏（实心 `#09090b` 加深色井）。** 否决：浅色模式会变成黑色列，且面板的 `rounded-lg` 会在外壳 `rounded-xl` 圆角上留下白色月牙。再给白色画布套一层内凹井是同样的多余外观：位图已经落在白色方块上。

**把边框和栏覆盖做成普通 `.css` 导入，或用 `slotProps` 上的 Tailwind `[&>div]:h-full` 拉伸二维码包装。** 否决：tsdown 只注入 CSS Module，且 web Tailwind `@source` 列表不包含 `ui-iam`，两条路径都到不了运行中的叠加层。

**改 sdkwork `form-control-styles` 以遵守 `--sdkwork-auth-field-border-color`。** 那是更干净的 API 补全，且 sdkwork 自己的页面测试钉住 `border-0`。BirdCoder 叠加可以恢复边框，而不分叉该约定。

## Consequences

- 浅色登录输入框是 overlay 填充加 `l2` 边框，衬在白色 shell 上；深色输入框仍比 elevated shell 深一档。
- 二维码列与对话框 shell 同色。白色画布直接落在该列上，不再套一层框填充；外层二维码卡是直角，由外壳圆角裁切该列，圆角处不再出现颜色错位。
- `sdkwork-auth.module.css` 用 `!important` 对抗 sdkwork 的 `border-0` 和密码框的内联 `borderWidth`。若 sdkwork 日后遵守边框 CSS 变量，可以去掉该覆盖。

## Testing

`packages/client/ui-iam/tests/auth-appearance.client.spec.ts` 钉住浅色 overlay 输入框填充、深色 `bg-layer-1` 填充、与 shell 同色且外框透明的二维码面板，以及输入框边框与齐平二维码列的 CSS Module 选择器。`apps/web/tests/ui-iam.e2e.ts` 断言浅色用户名框计算为 overlay `rgb(233, 236, 242)` 而不是白色。
