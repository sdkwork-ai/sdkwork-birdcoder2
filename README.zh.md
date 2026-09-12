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

所有受支持的安装方式，包括 npx、源码、Docker、Kubernetes 和全部桌面安装包，均详见[英文安装指南](INSTALL.md)或[中文安装指南](INSTALL.zh.md)。

GitHub Latest 当前指向 `birdcoder-v0.1.0-rc.13`。在通过全部校验的普通 Release 中，SemVer 最高的 tag 持有 Latest。

### 通过 `npm` 运行

安装 `Node.js`，然后运行：

```sh
npx @deepseek-ai/dsh@next web
```

该命令默认会在 `http://127.0.0.1:3080` 启动 Web UI，本机启动时还会用默认浏览器打开页面。通过 SSH 启动时只打印宿主机 URL，因为本地转发地址由 SSH 客户端或编辑器持有。传入 `--no-open` 可仅运行服务器而不打开浏览器。详见 [Web UI 指南](docs/user/guide/index.zh.md)。

npm `next` 渠道与 GitHub Releases 独立发布，可能包含更早的 dsh 版本。依赖准确版本前，请运行 `npx @deepseek-ai/dsh@next --version`。

### 安装桌面应用

从 [GitHub Releases](https://github.com/sdkwork-ai/sdkwork-birdcoder2/releases) 下载与 CPU 架构匹配的 Windows、macOS 或 Linux 安装包。[桌面安装指南](docs/user/guide/desktop.zh.md)列出了所有安装与便携格式，并说明校验和验证方法。

### 使用 Docker 或 Kubernetes 部署

容器部署使用端口 `4080`，npx/本地运行器仍使用 `3080`。按照[部署指南](docs/user/guide/deployment.zh.md)，可以从源码 clone 构建，也可以安装 GitHub Releases 中的离线镜像与部署包。

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

## 社区与支持

- 通过 [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions) 提交反馈或 bug 报告。
- 为你的插件仓库添加 [`dsh-plugin`](https://github.com/topics/dsh-plugin) 话题，便于被发现。
- 欢迎加入 DeepSeek Harness 企微群：扫码添加企微小助手并填写入群问卷，完成后小助手会邀请你入群。

扫码关注 DeepSeek Harness 微信公众号，并加入微信交流群。

<table>
  <thead>
    <tr>
      <th align="center">企微小助手</th>
      <th align="center">入群问卷</th>
      <th align="center">微信公众号</th>
      <th align="center">微信群组</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td align="center"><img src="assets/community-wecom-assistant.png" alt="DeepSeek Harness 企微小助手二维码" width="180" height="180"></td>
      <td align="center"><a href="https://trtgsjkv6r.feishu.cn/share/base/form/shrcnIt5twSVdLGD52KJBckGCgg"><img src="assets/community-wecom-survey.png" alt="DeepSeek Harness 入群问卷二维码" width="180" height="180"></a></td>
      <td align="center"><img src="assets/community-wechat-official-account.png" alt="DeepSeek Harness 团队微信公众号二维码" width="180" height="180"></td>
      <td align="center"><img src="assets/community-group.png" alt="DeepSeek Harness 微信群二维码" width="180" height="180"></td>
    </tr>
  </tbody>
</table>

## 参与贡献

参见 [CONTRIBUTING.md](CONTRIBUTING.zh.md)。

## 开发

请先阅读[开发指南](docs/development.zh.md)与[架构文档](docs/architecture.zh.md)。

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

## 应用根

- [apps 目录索引](apps/README.md)

## 仓库类型

`repository-kind: foundation-dependency`

本仓库是 **SDKWork BirdCoder2，即 DeepSeek Harness 的 fork**。仓库根 `packages/` 是随上游继承而来的
`@deepseek-ai/dsh-*` 基础包族，由本仓自身的应用面（`apps/cli`、`apps/desktop`、`apps/desktop-host`、
`apps/web`）以及 `apps/sdkwork-birdcoder2-*` 下的 SDKWork 客户端应用根消费。该包族属于基础/依赖层，
而非应用线包族，且**无法搬迁**到 `apps/<root>/packages/`：它就是上游布局，搬迁会让每一次
`git merge upstream/master` 产生灾难性冲突（见 AGENTS.md 的上游同步流程）。因此
`foundation-dependency` 正是让仓库根 `packages/` 留在 fork 契约所要求位置的仓库类型，这也是
“应用仓库禁止仓库根 `packages/`”这条规则在此不适用的原因。

没有任何其他 SDKWork 仓库消费 `@deepseek-ai/dsh-*`；依赖方向恰好相反 —— 本仓通过
`pnpm-workspace.yaml` 消费兄弟仓库的 SDKWork 源码（`@sdkwork/*`）。

构建在该基础之上的 SDKWork 客户端应用根位于 `apps/sdkwork-birdcoder2-*`，遵循应用规范
（`APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md` 及各端架构规范）—— 见
[apps 目录索引](apps/README.md) 与 [specs/component.spec.json](specs/component.spec.json)。
