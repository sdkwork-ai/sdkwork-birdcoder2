# DeepSeek Harness

[English](README.md) | 中文

DeepSeek Harness（`dsh`）是由 [DeepSeek AI](https://deepseek.com) 开发的开源 agent harness（智能体框架）。

它采用**一切皆插件**的架构，并由 [Cordis](https://github.com/cordiverse/cordis) 驱动，其设计参见论文 [_A Programming Paradigm for Spatiotemporal Composability_](https://github.com/cordiverse/paper)。

## 开发者预览

DeepSeek Harness 目前处于 _开发者预览_ 阶段，正在快速迭代。**未来将出现破坏兼容性的变更。**

## 运行

所有受支持的安装方式，包括 npx、源码、Docker、Kubernetes 和全部桌面安装包，均详见[英文安装指南](INSTALL.md)或[中文安装指南](INSTALL.zh.md)。

GitHub Latest 当前指向 `birdcoder-v0.1.0-rc.13`。在通过全部校验的普通 Release 中，SemVer 最高的 tag 持有 Latest。

### 通过 `npm` 运行

安装 `Node.js`，然后运行：

```sh
npx @deepseek-ai/dsh@next web
```

该命令会启动 Web UI，默认地址为 `http://127.0.0.1:7780`。详见 [Web UI 指南](docs/user/guide/index.md)。

npm `next` 渠道与 GitHub Releases 独立发布，可能包含更早的 dsh 版本。依赖准确版本前，请运行 `npx @deepseek-ai/dsh@next --version`。

### 安装桌面应用

从 [GitHub Releases](https://github.com/sdkwork-ai/sdkwork-birdcoder2/releases) 下载与 CPU 架构匹配的 Windows、macOS 或 Linux 安装包。[桌面安装指南](docs/user/guide/desktop.md)列出了所有安装与便携格式，并说明校验和验证方法。

### 使用 Docker 或 Kubernetes 部署

容器部署使用端口 `4080`，npx/本地运行器仍使用 `7780`。按照[部署指南](docs/user/guide/deployment.md)，可以从源码 clone 构建，也可以安装 GitHub Releases 中的离线镜像与部署包。

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

- 欢迎通过 [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions) 提交反馈或 bug 报告。
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

参见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 开发

请先阅读[开发指南](docs/development.md)与[架构文档](docs/architecture.md)。

面向 agent：请遵循 [AGENTS.md](AGENTS.md)。

## 许可证

[MIT](LICENSE)

第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
