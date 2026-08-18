## 实施目标

建立一套可复现的 SDKWork 双环境依赖机制，并修复当前 `pnpm run build` 被外部源码错误纳入根 TypeScript aggregate 的问题：

- 本地开发只通过仓库同级的 `../sdkwork-*` Git checkout 联调源码。
- CI、容器、线上构建和打包先从 Git 获取这些仓库，并固定到完整的 40 位提交 SHA，然后仍通过相同的相对 workspace 布局构建。
- 任何环境都禁止引用 `../birdcoder-pinned-parent`。
- 不把 package-level Git URL 作为主方案。pnpm 虽支持 `#path:/subdir`，但当前 `@sdkwork/utils`、`@sdkwork/sdk-common` 和部分 UI 包依赖未提交的 `dist` 或跨包 `workspace:*`，无法形成可靠的干净 Git package install；固定 SHA 的完整仓库 checkout 能保留 monorepo 闭包。

## 具体改动

1. **加入项目级强制规则**
   - 在根 `AGENTS.md` 的 Conventions 中加入一条简短 standing order：本地只允许 `../sdkwork-*`，线上必须从版本控制中的 pin 清单按完整 SHA checkout，禁止 `birdcoder-pinned-parent`，不得用未提交 sibling manifest 生成发布锁文件。
   - 链接到负责详细理由的 SDKWork pin Agent Note。
   - 因根 `AGENTS.md` 已接近预算上限，同步压缩相邻重复表述，保留现有规则含义，不提高预算。
   - 在 `docs/development.md` 及中文配对页补充本地 checkout、更新 pin、生成锁文件和线上失败条件的操作说明。

2. **建立唯一 Git pin 来源**
   - 新增版本控制中的结构化 SDKWork source manifest，记录仓库名、HTTPS Git URL、完整 SHA 及本地目录名。
   - 覆盖当前依赖闭包：`sdkwork-utils`、`sdkwork-sdk-commons`、`sdkwork-appbase`、`sdkwork-ui`、`sdkwork-core`、`sdkwork-iam`、`sdkwork-appstore`、`sdkwork-membership`、`sdkwork-order`、`sdkwork-promotion`、`sdkwork-knowledgebase`、`sdkwork-drive`。
   - 先验证每个候选 SHA 可从对应 origin 获取，并验证锁文件所依据的 package manifests 已包含在该提交中。不会修改或提交任何外部 SDKWork 仓库；若功能依赖只存在于外部仓库未提交改动中，将把该仓库列为明确发布阻塞项。

3. **移除 forbidden parent 并统一本地布局**
   - 将 `pnpm-workspace.yaml` 中两个 `../birdcoder-pinned-parent/...` 条目改为 `../sdkwork-utils/...` 和 `../sdkwork-sdk-commons/...`。
   - 同步修改 `tsconfig.base.json`、`packages/client/ui-token-plan/tsconfig.bundle.json` 及其他机器配置中的对应 source paths。
   - 移除根 `package.json` 中 pnpm 11 已忽略的 `pnpm.overrides` 配置，并把仍需要的 override 放到 `pnpm-workspace.yaml` 的受支持位置。
   - 从干净的 pinned sibling checkout 布局重新生成 `pnpm-lock.yaml`，确保不存在 `birdcoder-pinned-parent` link，也不把本地未提交 manifest 写入锁文件。

4. **让线上统一从 Git 获取源码**
   - 改造 `.github/actions/setup-sdkwork-siblings`，由 pin manifest 驱动全部仓库 checkout，不再在 action 内重复维护 SHA。
   - action 对目标目录执行严格验证：不存在则 clone/fetch 指定 SHA；已存在则验证 Git 仓库身份和 HEAD；错误提交、非 Git 目录或缺失 pin 直接失败，不再静默 skip。
   - Git 凭据只用于 fetch，不持久化到 sibling `.git/config` 或构建产物。
   - 所有执行 SDKWork 相关 install/build/pack 的 workflow 无条件调用该 action；缺少跨仓库读取凭据时给出明确失败，而不是跳过 clone 后产生迟发错误。纯 artifact 发布步骤不重新构建，可继续只消费已验证 tarball。
   - 扩展容器构建输入和 Dockerfile，使新增的 membership/order/promotion/knowledgebase/drive 仓库与原有七个仓库一起来自 pinned Git checkout。

5. **增加机器校验，防止规则退化**
   - 新增无第三方运行时依赖的 SDKWork source verifier 和 focused tests。
   - 静态模式检查：依赖配置和锁文件不含 `birdcoder-pinned-parent`；所有外部 workspace path 都是允许的 `../sdkwork-*`；每个仓库都在 pin manifest 中；URL 使用 HTTPS；SHA 是完整 40 位；action/Docker/workspace 的仓库集合一致。
   - online 模式额外检查每个 sibling 的实际 Git HEAD 与 pin 一致，并拒绝缺失 checkout。锁文件生成/发布校验还检查相关 manifest 相对 pin 没有漂移。
   - 将 verifier 加入根 scripts、`ciSharedStaticGates()` 和 release/build 边界，使本地约束、CI 和发布使用同一规则。

6. **修复当前 build 的 TypeScript 归属错误**
   - 保留 `ui-iam` 已有的 declaration facade + dedicated SDKWork source typecheck 模式。
   - 将 `sdkwork-knowledgebase` 测试从 host/client 根 aggregate 隔离，交由现有 `ui-knowledge/tsconfig.tests.json` 检查；根 aggregate 不再直接吞入 knowledgebase、drive、sdk-common、utils 的外部源码。
   - 保留 bundle 配置对真实 SDKWork source 的解析，使运行时产物仍包含真实实现；声明 emit 使用本地 facade，完整源码兼容性由 dedicated no-emit project 验证。
   - 继续处理构建暴露出的同类 compiler-face 问题，但不修改外部 SDKWork 源码来迎合本仓库严格选项。

7. **更新决策记录**
   - 更新现有 pinned sibling lockfile process note，记录唯一 pin manifest、本地与线上职责、forbidden parent 和锁文件权威来源。
   - 更新 CI sibling checkout note，修正“pnpm 不支持 `#path`”这一已不准确事实：语法受支持，但当前包的 `dist`/`prepare`/`workspace:*` 闭包使其不适合作为本项目的发布机制。
   - 同步英文、中文和 i18n sidecar。两份 active note 都保留：一份拥有 pin/lockfile 决策，另一份拥有 CI/container acquisition 机制。

## 验证

- 在隔离临时父目录中按 pin manifest checkout 12 个仓库，放置当前仓库副本，并执行 `pnpm install --frozen-lockfile`，证明线上不依赖开发机现有 sibling 或 dirty tree。
- 运行 verifier 的 focused tests及静态/online 两种模式。
- 运行 Knowledge Base/UI 相关 dedicated typecheck 和 focused Vitest。
- 运行 `pnpm run build`，确认原来的 500 条外部源码级联错误消失。
- 运行 `pnpm run check:ci:static`、相关 release verify/pack/packed-install 检查，以及 `git diff --check`。
- 运行文档预算、Agent Note format、翻译配对和 `doc-sync`；只报告实际执行并通过的命令。

实施时保留当前工作区所有已有未提交改动，不回退用户文件，也不提交或推送任何仓库。