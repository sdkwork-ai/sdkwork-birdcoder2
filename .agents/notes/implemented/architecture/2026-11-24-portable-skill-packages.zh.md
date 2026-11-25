# Agent Note: Portable skill packages

Status: implemented

[English](2026-11-24-portable-skill-packages.md) | 中文

## 问题

用户或别的智能体安装的技能是一个目录包，而不是一个仓库 checkout。部署技能按名称引用了 6 份 `sdkwork-specs` 文档，并假设存在同级 checkout，因此没有该 checkout 的机器无法解析规范正文。可分发技能还有第二个失败点：许多安装器只复制 `SKILL.md`，把 `references/` 与 `scripts/` 留在原地且没有任何提示。仓库绑定技能（`.agents/skills`、preset 的开发者技能）引用 checkout 是合理的，但此前没有任何东西把它们与产品技能区分开，安装器可能把它们当可移植技能从而破坏。

## 决定

- **产品技能自包含。** `birdcoder-app-deploy` 在 `references/standards/` 下随包携带 6 份提炼契约（manifest v3、客户端架构对齐、打包、宿主部署、环境、部署布局）。入口只把完整规范正文列为权威；内置契约是运行依据。
- **锁定已评审的标准。** `references/standards.lock.json` 记录 `sdkwork-specs` 修订号与 9 份引用规范的 SHA-256，以及 6 份内置契约的哈希。`scripts/gen-skill-package.ts` 生成锁与 `skill.manifest.json`；`--check` 在漂移时失败。
- **checkout 可选。** `scripts/standards.mjs` 按序解析：`SDKWORK_SPECS_HOME`、技能任一祖先旁的 `sdkwork-specs`、内置契约、无。预检只在可访问 checkout 时运行官方 manifest 检查器；否则用内置契约校验，发布照常进行。
- **安装完整性可证明。** `skill.manifest.json` 列出每个打包文件的 SHA-256 与必需的 `references/`/`scripts/` 条目；`scripts/selfcheck.mjs --strict` 报告单文件安装并列出缺失文件。
- **包可安全分发与安装。** `scripts/pack-skill.ts` 先校验 manifest，再写出确定性 ZIP（`dist/skill-packages/<name>-<version>.zip`）、其 `.sha256` 与包含文件列表和校验和的描述文件。`scripts/install-skill.ts` 把目录或该 ZIP 安装到技能根：暂存前后都校验哈希，拒绝 `..`/绝对路径的归档条目与未列文件，只有 `--force` 才替换同名技能。
- **产品与仓库作用域在门禁处显式区分。** `scripts/verify-skill-portability.ts` 把内置目录视为产品（禁止父路径、绝对路径、`sdkwork-specs` 链接或命令，携带资产时必须带 manifest），把 `.agents/skills` 与 preset 视为仓库（允许引用 checkout，死链记为警告）。产品技能的仓库镜像沿用产品规则，避免镜像变成第二作用域。
- **可移植规则随门禁一起落地。** `pnpm run verify-skill-portability` 与 `pnpm run verify-skill-package` 加入快速门禁；技能自身的测试覆盖解析、预检回退与完整性。

## 考虑过的替代方案

- **要求每台机器都有 `sdkwork-specs` checkout。** 否决：这正是被报告的问题，并且让第二个仓库成为使用技能的前提。
- **逐字复制 6 份规范进技能。** 否决：包体变大、规范正文并非为代理工作流而写、复制件会漂移。提炼契约陈述工作流所需的决定与字段，锁让偏离可评审。
- **运行时从 URL 拉取规范。** 否决：发布必须离线可用，且不可信远程文本带来供应链与提示注入风险。
- **允许安装器只复制 `SKILL.md` 并静默降级。** 否决：工作流随后引用机器上不存在的文件。manifest 与 selfcheck 把它变成具名、可操作的失败。
- **把所有仓库技能都改成可移植。** 否决：`.agents/skills` 描述的是本 checkout，并非产品内容。在门禁处标作用域才是诚实的边界；只有产品技能必须自包含。

## 后果

- 升级 `sdkwork-specs` 时需要评审受影响的提炼契约并重跑 `pnpm run gen-skill-package`；锁未刷新前门禁失败。提炼文本可能滞后于规范，因此锁记录已评审修订号，解析器在有 checkout 时优先使用它。
- 部署技能多携带 6 份契约（总计约 35 KB），额外文件必须一起安装。只复制 `SKILL.md` 的安装器现在会在 selfcheck 失败，而不是稍后才失败。
- 仓库技能仍可能有指向模板占位符的死链；门禁把它们记为警告，不阻塞无关工作。
- 已发布站点卡片使用清单封面（预览、其次截图、最后图标），而不是抓取实时页面；实时截图需要客户端浏览器捕获路径，列为后续工作。

## 验证

- `pnpm run verify-skill-portability` —— 三个技能根零错误。
- `pnpm run verify-skill-package` —— 锁与 manifest 为最新。
- `pnpm exec vitest run packages/skill/sdkwork-builtin-skills scripts/verify-skill-portability.spec.ts scripts/skill-package.spec.ts` —— 预检、解析器、selfcheck、门禁与分发测试。
- `pnpm run pack-skill` 后执行 `pnpm exec tsx scripts/install-skill.ts --from dist/skill-packages/<name>-<version>.zip --to <skills-root>`，安装后的目录通过 `selfcheck --strict`。
- 把技能与一个 fixture 项目复制到 `%TEMP%`，并把 `SDKWORK_SPECS_HOME` 指向不存在路径：`standards.mjs --check` 报告 `bundled`，`selfcheck --strict` 报告完整，`preflight.mjs` 报告 `ok: true`。
