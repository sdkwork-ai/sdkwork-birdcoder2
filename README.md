# DeepSeek Harness

English | [中文](README.zh.md)

DeepSeek Harness (`dsh`) is an open-source agent harness developed by [DeepSeek AI](https://deepseek.com).

It uses an architecture where **everything is a plugin**, and is powered by [Cordis](https://github.com/cordiverse/cordis), whose design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://github.com/cordiverse/paper).

## Developer preview

DeepSeek Harness is currently in _developer preview_ and is iterating rapidly. **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.**

## Run

For every supported installation path, including npx, source, Docker, Kubernetes, and all desktop packages, follow the [English installation guide](INSTALL.md) or [Chinese installation guide](INSTALL.zh.md).

GitHub Latest currently points to `birdcoder-v0.1.0-rc.12`. Among fully verified regular releases, the highest SemVer tag holds the Latest pointer.

### Run from `npm`

Install `Node.js`, then run:

```sh
npx @deepseek-ai/dsh@next web
```

The command starts the Web UI, served at `http://127.0.0.1:7780` by default. See [Web UI guide](docs/user/guide/index.md).

The npm `next` channel is published independently from GitHub Releases and may contain an older dsh version. Run `npx @deepseek-ai/dsh@next --version` before relying on an exact version.

### Install the desktop application

Download the Windows, macOS, or Linux package for your CPU architecture from [GitHub Releases](https://github.com/sdkwork-ai/sdkwork-birdcoder2/releases). The [desktop installation guide](docs/user/guide/desktop.md) lists every installer and portable format and explains checksum verification.

### Deploy with Docker or Kubernetes

Container deployments use port `4080`, while the npx/local runner keeps `7780`. Build from a source clone or install the offline image and deployment bundle from GitHub Releases by following the [deployment guide](docs/user/guide/deployment.md).

### Run from source

To run from a repository checkout:

```sh
git clone https://github.com/sdkwork-ai/sdkwork-birdcoder2.git
cd sdkwork-birdcoder2
pnpm install
pnpm run build
pnpm dsh web
```

## Community and support

- Feel free to submit feedback or bug reports through [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions).
- Add the [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic to your plugin repository for discoverability.
- Join <a href="https://discord.gg/Ycq5dCaS4">DeepSeek Harness Discord community</a>.

Scan the QR codes to follow the DeepSeek Harness WeChat Official Account and join the WeChat community group.

<table>
  <thead>
    <tr>
      <th align="center">WeChat Official Account</th>
      <th align="center">WeChat Group</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td align="center"><img src="assets/community-wechat-official-account.png" alt="DeepSeek Harness WeChat Official Account QR code" width="180" height="180"></td>
      <td align="center"><img src="assets/community-group.png" alt="DeepSeek Harness WeChat Group QR code" width="180" height="180"></td>
    </tr>
  </tbody>
</table>

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Development

Start with the [development guide](docs/development.md) and [architecture documentation](docs/architecture.md).

For agents, follow [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE)

Third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
