# Agent Note：所有入口共用一个登录界面

Status: implemented

[English](2026-11-04-unified-login-surface.md) | 中文

## 问题

产品此前通过两套互不相关的界面提供登录。桌面欢迎窗（`apps/desktop`）承载的是随包发布的设计：BirdCoder 图标与文字标志、`欢迎使用 BirdCoder`、标语、实心 `登录` 和浮起式 `添加 API Key`，且采用固定的 600 × 700 分带布局。Web 界面的账号弹窗（`ui-settings-account`）则是一个通用模态框：标题为“开始使用”，正文是一段说明文字，操作行右对齐；它既不共享品牌头、文案，也不共享按钮几何。因此从侧边栏登录与启动时登录看起来是两个产品，两处界面还要各自维护。这些入口还会自行发起浏览器流程（`AccountMenu`、`AccountSection`），所以弹窗只会出现在等待状态，用户认得的那张登录页在工作区里从未出现过。

## 决定

由 `ui-primitives` 拥有唯一的纯展示组件 `LoginPanel`，所有登录界面都渲染它。它与 `BirdLogo`、`BirdWordmark` 一样属于 fork 自有文件，上游合并无法回退这次统一。

- **一套布局，两种变体。** `variant="window"` 精确复现桌面欢迎窗几何（40px 品牌带、`minmax(0, 1fr)` 身份区、104px 操作带、24/48/76 内边距）；`variant="dialog"` 以 36px 间距堆叠同样的三条带，并为模态卡片提供角部关闭控件。两种变体都渲染品牌图标、带强调产品名的欢迎语、标语，以及 240px 操作列，主操作在副操作之上。
- **文案与操作都是 props。** 该组件不拥有语言资源，与其他原子组件一致。`welcome` 提供 `before`/`brand`/`after`/`description`；`actions` 是有序的操作描述列表（`primary`、`secondary`、`text`），支持 `busy`/`busyLabel`、`disabled`、`hidden`，以及用于宿主表单提交的 `form`。`children` 用来以某个登录方式页替换欢迎区块，`welcomeHidden` 则让欢迎区块保持挂载以配合桌面的页面切换。
- **桌面欢迎窗在每一页都渲染它。** `WelcomePage` 把入口页、API Key 表单和登录状态作为 `children`/`actions` 传入，于是原先由 `renderer/welcome.css` 负责的品牌行、欢迎语和操作列改由共享组件负责。id、hidden 切换、焦点行为、埋点调用、IPC 操作和文案快照都保持不变。
- **Web 账号弹窗在所有状态下都渲染它。** 空闲状态就是欢迎页：品牌、欢迎语、标语、`登录`、`添加 API Key`。等待、超时和失败仍使用同一面板，只是用登录方式状态块替换欢迎区块，因此弹窗始终保留品牌身份。`AccountMenu` 与账号设置里的签到按钮改为打开该界面（`showLogin(true)`）而不再直接发起流程；只有界面自己的 `登录` 会发起，与欢迎窗一致。
- **SDKWork IAM 模态宿主也以它为入口步骤。** `ui-sdkwork-iam` 的 `SignInOverlay`——设置菜单“登录 / 注册”行、受门控模式页的登录按钮、模型选择触发的登录要求背后的界面——以 `LoginPanel`（`variant="dialog"`）打开，提供 `登录`，并在桌面壳暴露密钥页时额外提供 `添加 API Key`。该入口自己的 `登录` 执行配置的登录手势：默认跳转系统浏览器完成托管登录，部署配置为弹窗时则在同一浮层中唤起 sdkwork 账号登录方式表单（密码、手机验证码、邮箱验证码、扫码）（[决定](2026-11-04-configurable-login-gesture.zh.md)）。若调用方自己的界面已经展示过入口（桌面欢迎页，或其中以 `login` 结束的 API Key 页），同样执行配置的手势，入口不会连续出现两次。
- **文案即桌面文案。** 新增的账号与 IAM 文案键承载与 `apps/desktop/src/locale.ts` 相同的欢迎语和标语，产品名来自 `readOemBrandName()`，因此 OEM 部署会同时重命名每一处界面。退役的 `loginTitle`/`loginDescription` 键已删除。

## 备选方案

**只把 Web 弹窗改成同款外观，桌面标记保持原样。** 放弃原因：“统一”会变成靠两个文件维持的视觉巧合；任一处下次改动就会再次分开，而这正是品牌契约已经为图标解决过的失效模式。

**把组件放进新的 `ui-sdkwork-login` 包。** 放弃原因：客户端插件包不得在运行时导入另一个功能包的组件，`ui-settings-account` 因而无法渲染它。`ui-primitives` 才是文档规定的跨插件共享组件归属地。

**把弹窗的可访问名保留为旧的“开始使用”以维持外部选择器。** 放弃原因：可见标题已是欢迎语，可访问名不包含可见文本会违反 label-in-name；改为更新仓库内的四个 e2e 选择器和一份 ARIA golden。

**仍从菜单直接发起登录，只在等待时显示欢迎页。** 放弃原因：需求是先呈现附件所示的登录组件；否则浏览器会在用户看到产品登录页之前就打开。

**把设置菜单的登录行指向 Web 账号弹窗而不是 IAM 浮层。** 放弃原因：该弹窗发起的是 DeepSeek 账号授权流程，而当前部署的租户并未注册为依赖方；桌面端的产品账号是 SDKWork IAM 会话。该行会打开一个无法完成的登录。

## 后果

所有登录入口——桌面启动、设置菜单的“登录 / 注册”行、受门控模式页、模型选择、侧边栏账号菜单、账号设置，以及模型引导中的登录步骤——现在都会显示同一个 BirdCoder 登录界面，由该界面的 `登录` 执行配置的登录手势（默认跳转浏览器登录）。登录方式页（IAM 账号表单、API Key 表单、等待浏览器、超时、失败）位于该界面之后一步，并保留品牌头。会话中打开 IAM 浮层比过去直接弹 Modal 多一次点击；桌面欢迎页的交接，以及已经展示过欢迎页的登录要求，会跳过这次点击。Web 弹窗因此比原先的 380px 卡片更高，宽度上限为 400px，视口更窄时操作列会收缩到 240px 以下。桌面欢迎窗几何不变；`renderer/welcome.css` 不再负责品牌行、欢迎语和操作列。

## 测试

`packages/client/ui-primitives/tests/login-panel.client.spec.tsx` 覆盖身份区块、操作分发、忙碌加载器及其可访问名、文本操作、弹窗关闭控件、隐藏的欢迎区块、`form` 提交操作，以及以登录方式内容替换欢迎区块。`apps/desktop/tests/welcome-renderer.client.spec.tsx` 保留全部 31 项欢迎行为及逐语言文案快照，其中品牌行断言改为读取该行文本而非样式表类名。`packages/client/ui-settings-account/tests/sign-in-dialog.client.spec.tsx` 重新录制了每种弹窗状态，`account.client.spec.tsx` 固定了“两个入口都只打开界面、不发起流程”。`packages/client/ui-sdkwork-iam/tests/sign-in-overlay.client.spec.tsx` 固定了入口步骤（登录、仅桌面出现的 API Key 选项、方式标签缺席）、方式步骤与未配置提示；`iam-service*.client.spec.ts` 固定了各手势唤起的是 `openEntry` 还是 `openLogin`。Web e2e 的弹窗选择器与 `onboarding-deepseek-config` 的 ARIA golden 改用欢迎标题作为弹窗名称。
