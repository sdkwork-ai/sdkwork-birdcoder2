# DeepSeek Harness

[English](README.md) | 中文

DeepSeek Harness（`dsh`）是由 [DeepSeek AI](https://deepseek.com) 开发的开源 agent harness（智能体框架）。

它构建于**一切皆插件**的架构之上，由 [Cordis](https://github.com/cordiverse/cordis) 驱动，其设计参见论文 [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512)。

文档：[https://deepseek-harness.github.io/deepseek-harness/](https://deepseek-harness.github.io/deepseek-harness/)

## 开发者预览

DeepSeek Harness 处于 _开发者预览_ 阶段，正在快速迭代。**未来将出现破坏兼容性的变更。**

运行本项目前，请阅读[安全说明](SAFETY.zh.md)。

<a id="run"></a>

## 运行

所有受支持的安装路径——包括 npx、源码、Docker、Kubernetes 以及所有桌面安装包——请参阅[英文安装指南](INSTALL.md)或[中文安装指南](INSTALL.zh.md)。

GitHub Latest 当前指向 `birdcoder-v0.1.0-rc.13`。在所有完全验证过的常规发布中，SemVer 最高的 tag 持有 Latest 指针。

### 通过 `npm` 运行

安装 `Node.js`，然后运行：

```sh
npx @deepseek-ai/dsh@next web
```

该命令默认会在 `http://127.0.0.1:3080` 启动 Web UI，本机启动时还会用默认浏览器打开页面。通过 SSH 启动时只打印宿主机 URL，因为本地转发地址由 SSH 客户端或编辑器持有。传入 `--no-open` 可仅运行服务器而不打开浏览器。详见 [Web UI 指南](docs/user/guide/index.zh.md)。

### 安装桌面应用

从 [GitHub Releases](https://github.com/sdkwork-ai/sdkwork-birdcoder2/releases) 下载适用于你的 CPU 架构的 Windows、macOS 或 Linux 安装包。[桌面安装指南](docs/user/guide/desktop.zh.md) 列出了所有安装器与便携格式，并说明如何校验校验和。

### 使用 Docker 或 Kubernetes 部署

容器部署使用端口 `4080`，而 npx/本地运行器保持 `3080`。可以从源码克隆构建，也可以按[部署指南](docs/user/guide/deployment.zh.md)从 GitHub Releases 安装离线镜像与部署包。

<a id="run-from-source"></a>

### 从源码运行

如需从仓库源码运行：

```sh
git clone https://github.com/sdkwork-ai/sdkwork-birdcoder2.git
cd sdkwork-birdcoder2
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` 会准备仓库产物。`pnpm dsh web` 会直接使用这些已构建产物，不会重新构建。

## 社区与支持

- 通过 [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions) 提交反馈或 bug 报告。
- 为你的插件仓库添加 [`dsh-plugin`](https://github.com/topics/dsh-plugin) 话题，便于被发现。
- 欢迎加入 DeepSeek Harness 企微群！扫描下方二维码填写入群问卷，小助手会定期发送入群邀请。

<table>
  <thead>
    <tr>
      <th align="center">入群问卷</th>
      <th align="center">微信公众号</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td align="center"><a href="https://trtgsjkv6r.feishu.cn/share/base/form/shrcnIt5twSVdLGD52KJBckGCgg"><img src="https://cdn.deepseek.com/harness/readme/community-wecom-survey.png" alt="DeepSeek Harness 入群问卷二维码" width="180" height="180"></a></td>
      <td align="center"><img src="https://cdn.deepseek.com/harness/readme/community-wechat-official-account.png" alt="DeepSeek Harness 团队微信公众号二维码" width="180" height="180"></td>
    </tr>
  </tbody>
</table>

## 参与贡献

参见 [CONTRIBUTING.md](CONTRIBUTING.zh.md)。

## 开发

请先阅读[开发指南](docs/development.zh.md)与[架构文档](docs/architecture.zh.md)。

`pnpm run dev:web` 会在一个终端里完成构建、启动，并在源码修改时重建 client bundle；`make help` 列出 Web 与 Desktop 对应的 Make target。完整表格见开发指南的「应用命令」一节。

面向 agent：请遵循 [AGENTS.md](AGENTS.md)。

## 引用

```bibtex
@misc{deepseek-harness2026,
  title={DeepSeek Harness: Everything is a Plugin},
  author={DeepSeek-AI},
  year={2026},
  publisher={GitHub},
  howpublished={\url{https://github.com/deepseek-ai/deepseek-harness}},
}
```

## 许可证

[MIT](LICENSE)

第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 部署应用身份

Web 构建烘焙进页面的公开应用 access token 必须携带本安装的 deploy application id（`app_id`/`aud`）——即 IAM 绑定的十进制 `deploy_app.id`。仓库无法得知某个安装的 id，因此根目录 `.env.<deployment-profile>.<environment>` 文档携带 `__SDKWORK_DEPLOY_APPLICATION_ID__` 占位符，并由 `apps/web/vite.config.ts` 在构建时替换该锚点。

该 token 随打包应用一起发布，因此是永久的：`exp` 为 `0`（永不过期），绝不是一个会话有效期。矩阵的每个 profile 都携带一个——token-only 物化器模式拥有那一行并保留每个已记录 profile 的其余内容——并且每种应用类型（Web/Desktop 外壳、PC/H5/pad、Flutter、小程序）都有同一矩阵。

构建先由环境解析锚点，然后回退到已加载的 env 层：仓库中被 gitignore 的 `.env`，或者——当某个 surface 拥有自己的物化 profile 后——`apps/web/.env.local`，因为 `apps/web/vite.config.ts` 加载的是 surface 目录，从不读取仓库 `.env` 层。已由物化器锚定的 token 也能满足构建，因此已物化的 surface 无需导出；只有不带锚点的占位 token 会失败。在没有锚点的构建主机上导出该锚点（它不是秘密）。CI 读取仓库变量 `SDKWORK_DEPLOY_APPLICATION_ID`，未设置时回退到已记录的注册 id，因此部署可以在不编辑 workflow 的情况下重定向锚点：

```sh
export SDKWORK_DEPLOY_APPLICATION_ID=381158401561858048
pnpm build
```

`admin:bootstrap:app` 记录远程注册返回的 id：IAM application bootstrap 以 `deployApplicationId` 应答，该命令把它写入仓库 `.env`（作为 surface 作用域的 `SDKWORK_DEPLOY_APPLICATION_ID_<SURFACE>`，或仓库根 surface 的基础变量）以及该 surface 的 `.env.local`。任何其他调用返回的 id——或已签发 token 携带的 id——也以同样方式记录：

```sh
pnpm exec tsx scripts/bootstrap/record-deploy-anchor.ts --from registration-response.json
pnpm exec tsx scripts/bootstrap/record-deploy-anchor.ts --access-token "$SDKWORK_ACCESS_TOKEN" \
  --surface apps/web --surface-id sdkwork-birdcoder2-web-app
```

永不要提交真实 token 或真实 app id：记录器写入的两层都被 gitignore，`.env.example` 记录了同一契约。

## 应用根目录

- [apps 目录索引](apps/README.md)

## 仓库类型

`repository-kind: foundation-dependency`

本仓库是 **DeepSeek Harness 的 SDKWork BirdCoder2 fork**。其仓库根 `packages/` 是继承自上游的 `@deepseek-ai/dsh-*` 基础包族，由本仓库自己的应用表面（`apps/cli`、`apps/desktop`、`apps/desktop-host`、`apps/web`）以及 `apps/sdkwork-birdcoder2-*` 下的 SDKWork 客户端根目录消费。该树是基础/依赖层，不是应用线包族，并且**不能迁移**到 `apps/<root>/packages/`：那是上游布局，移动它会让每次 `git merge upstream/master` 产生灾难性冲突（见 AGENTS.md 中的上游同步流程）。因此 `foundation-dependency` 是让仓库根 `packages/` 留在 fork 契约要求位置的那种仓库类型，这也是应用仓库禁止仓库根 `packages/` 的规则在此不适用的原因。

没有其他 SDKWork 仓库消费 `@deepseek-ai/dsh-*`；关系是相反的——本仓库通过 `pnpm-workspace.yaml` 消费 SDKWork 兄弟源码（`@sdkwork/*`）。

构建在该基础之上的 SDKWork 客户端表面位于 `apps/sdkwork-birdcoder2-*`，遵循应用标准（`APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md` 及各架构标准）——见 [apps 目录索引](apps/README.md) 与 [specs/component.spec.json](specs/component.spec.json)。
