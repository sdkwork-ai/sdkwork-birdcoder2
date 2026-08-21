# Agent Note：CI 检出 SDKWork 生态 sibling 仓库

状态：已实现

[English](2026-08-17-ci-sdkwork-sibling-checkouts.md) | 中文

## 问题

SDKWork 集成（ui-sdkwork-iam、ui-sdkwork-feedback、ui-sdkwork-env）通过 `pnpm-workspace.yaml` 中以 `../sdkwork-*` 声明的 pnpm workspace 成员，把 `@sdkwork/*` 包作为原始源码消费。这种布局在开发机上成立，但在 CI 里不成立：GitHub Actions 只检出本仓库，因此每个"安装 + 构建"job 都会把 sibling 成员解析成悬空链接，全仓构建（tsdown 会把真实 sdkwork 源码内联进 ui-sdkwork-iam 客户端 bundle）随之失败。两个替代方案先行排除：包级 git 依赖无法选择 monorepo 子目录（pnpm 拒绝 `#path=` 语法与斜杠形式），且除 app SDK 与 sdk-common 外 sdkwork 包都没有 npm 发布版。sibling 仓库除 `sdkwork-appbase`（私有）外全部公开，而构建闭包需要其中三个包，默认 `GITHUB_TOKEN` 从不跨仓库，CI 无法凭它克隆私有仓库。

## 决策

CI 在检出仓库旁克隆 siblings，复刻开发机布局，通过一个所有安装/构建 job 都会调用的 composite action 完成：

- `.github/actions/setup-sdkwork-siblings` 按钉住的 ref（当前集成所基于的版本）把七个 sibling 仓库克隆到检出目录的父目录，既有的 `../sdkwork-*` workspace globs 与 `tsconfig.base.json` 路径原样解析。ref 写在 action 里；与本地开发检出一起升级。
- 克隆用 `secrets.SDKWORK_GITHUB_TOKEN` 认证——一个持有对私有 `sdkwork-appbase` 读取权限的账户 token 的仓库 secret（即同账户访问模型；后续用作用域受限的 fine-grained PAT 替换）。步骤用 `if: secrets.SDKWORK_GITHUB_TOKEN != ''` 守卫，fork 拉取请求（无 secrets）跳过克隆而不是在步骤处失败。
- 容器镜像构建通过 buildx 命名上下文（`sdkwork-ecosystem`）获得 siblings：container-image job 把仓库检出到 `repo/` 子目录，使命名上下文路径保持在 workspace 内；Dockerfile 把七个 sibling 目录复制进构建阶段。全仓安装与构建在 runner 上完成；第二个命名上下文（`prebuilt`）提供已验证的树，因此镜像阶段只打包 release tarball 并安装独立运行时。
- 需要全仓安装与构建的 workflow（ci、release、desktop-release、container-release、e2e、e2b-e2e、sandbox、docs-pages、build-exe-for-python-sdk）都加入了该步骤；不构建 sdkwork 相关客户端包的 workflow（landlock-run、release-vendor、pi-ai-provider-e2e）不加——frozen install 容忍悬空 sibling 链接。

## 备选方案

| 已否决 | 一句话原因 |
|---|---|
| 包级 git 依赖 | pnpm 无法选择 monorepo 子目录（`#path=` 与斜杠形式都失败） |
| CI 无凭据克隆 | `sdkwork-appbase` 私有，`GITHUB_TOKEN` 从不跨仓库 |
| 把 sdkwork 源码 vendor 进本仓库 | 复制内容并背上上游同步负担；CI 克隆布局让 sibling 检出保持为唯一事实源 |
| 本次发布不带 SDKWork 集成 | 安装包里缺少已上线的账号与反馈表面 |

## 影响

- 发布流水线（桌面矩阵、容器镜像、Compose/Kubernetes 包）能在 CI 构建；钉住的 sibling ref 让构建可复现。
- 本地开发保持同样的 `../sdkwork-*` 布局；开发者的 workspace 与构建配置没有任何变化。
- token 是用户的账号 token，作用域较宽——后续应替换为只读、只覆盖七个 sibling 仓库的 fine-grained PAT。
- 升级 sibling 检出时，需要连同本地检出一起更新 `.github/actions/setup-sdkwork-siblings/action.yml` 中的钉住 ref。
