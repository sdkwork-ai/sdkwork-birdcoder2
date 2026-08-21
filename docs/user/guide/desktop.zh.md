# 安装桌面应用

[English](desktop.md) | 中文

桌面应用运行与 `npx @deepseek-ai/dsh@next web` 相同的 Web profile，并保存相同的 Harness 数据，但它通过 Electron IPC 提供 UI，不打开 HTTP 端口。npm `next` 渠道独立发布，可能早于当前 GitHub Release。npx 启动器仍使用 `7780`，Docker 使用 `4080`，Kubernetes 本地转发使用 `4081`，因此这些模式可以同时运行。

## 选择资产

打开 [GitHub Releases 页面](https://github.com/sdkwork-ai/sdkwork-birdcoder2/releases)，选择目标 `birdcoder-v<version>` Release，再下载与操作系统和 CPU 架构匹配的文件。

GitHub Latest 当前指向 `birdcoder-v0.1.0-rc.13`。在通过全部校验的普通 Release 中，SemVer 最高的 tag 持有 Latest；只有需要固定特定版本时才选择其他 tag。

| 平台 | 架构 | 安装包 | 便携归档 |
|---|---|---|---|
| Windows | x64 或 arm64 | `BirdCoder-<version>-win-<arch>.exe` | `BirdCoder-<version>-win-<arch>.zip` |
| macOS | x64 或 arm64 | `BirdCoder-<version>-mac-<arch>.dmg` | `BirdCoder-<version>-mac-<arch>.zip` |
| Linux | x64 | `*-linux-x86_64.AppImage`、`*-linux-amd64.deb` 或 `*-linux-x86_64.rpm` | `*-linux-x64.tar.gz` |
| Linux | arm64 | `*-linux-arm64.AppImage`、`*-linux-arm64.deb` 或 `*-linux-aarch64.rpm` | `*-linux-arm64.tar.gz` |

Release 还包含 `SHA256SUMS`、更新元数据、Docker/Kubernetes 部署包以及离线 Linux 容器镜像。容器安装方法见[部署指南](deployment.zh.md)。

## 校验下载文件

将 `SHA256SUMS` 下载到所选资产旁。汇总文件还列出了本地不存在的其他 Release 资产，因此只校验所选文件对应的行。在 Linux 上运行：

```sh
version='X.Y.Z'
asset="BirdCoder-${version}-linux-x86_64.AppImage"
awk -v name="$asset" '$2 == name' SHA256SUMS | sha256sum --check
```

在 macOS 上使用系统提供的 `shasum` 命令：

```sh
version='X.Y.Z'
asset="BirdCoder-${version}-mac-x64.dmg"
awk -v name="$asset" '$2 == name' SHA256SUMS | shasum -a 256 --check
```

在 Windows PowerShell 中，所选 checksum 缺失或不匹配时让命令失败：

```powershell
$version = 'X.Y.Z'
$asset = "BirdCoder-$version-win-x64.exe"
$actual = (Get-FileHash -LiteralPath $asset -Algorithm SHA256).Hash.ToLowerInvariant()
$line = Get-Content .\SHA256SUMS | Where-Object { $_ -match "^[0-9a-f]{64}  $([regex]::Escape($asset))$" }
if ($null -eq $line) { throw "No checksum found for $asset" }
$expected = ($line -split '\s+', 2)[0]
if ($actual -ne $expected) { throw "Checksum mismatch for $asset" }
Write-Output "$asset checksum verified"
```

候选版本尚未签名，因此 Windows SmartScreen、macOS Gatekeeper 或 Linux 桌面环境可能要求确认。批准操作系统提示前，请先校验摘要与仓库来源。

## 安装

在 Windows 上运行 `.exe` 完成当前用户安装，或解压 `.zip` 并直接启动 `birdcoder.exe`。

在 macOS 上打开 `.dmg`，再将 BirdCoder 移入 Applications，或解压 `.zip`。对于未签名的候选版本，可能需要从 Finder 上下文菜单打开已校验的应用。

在 Debian 或 Ubuntu 上安装 `.deb` 包：

```sh
version='X.Y.Z'
deb_arch='amd64'
sudo apt install "./BirdCoder-${version}-linux-${deb_arch}.deb"
```

在 Fedora、RHEL 或其他基于 RPM 的发行版上安装 `.rpm` 包：

```sh
version='X.Y.Z'
rpm_arch='x86_64'
sudo rpm -Uvh "./BirdCoder-${version}-linux-${rpm_arch}.rpm"
```

AppImage 与 tar 归档是便携安装方式：

```sh
version='X.Y.Z'
appimage_arch='x86_64'
tar_arch='x64'
chmod +x "BirdCoder-${version}-linux-${appimage_arch}.AppImage"
"./BirdCoder-${version}-linux-${appimage_arch}.AppImage"

mkdir birdcoder
tar -xzf "BirdCoder-${version}-linux-${tar_arch}.tar.gz" \
  --strip-components=1 -C birdcoder
./birdcoder/birdcoder
```

将 `deb_arch` 设为 `amd64` 或 `arm64`，将 `rpm_arch` 设为 `x86_64` 或 `aarch64`，将 `appimage_arch` 设为 `x86_64` 或 `arm64`。将 `tar_arch` 设为 `x64` 或 `arm64`。

## 首次运行与更新

开始会话前，打开**设置 -> 模型**并配置提供方。桌面与 npx 启动共用 `$DSH_HOME` 或 `~/.dsh`，包括 profile、设置、凭据、会话、附件和工作区。默认关闭窗口后应用会留在系统托盘中；需要关闭窗口即停止进程时，请使用托盘的退出命令，或在通用设置中关闭「关闭到托盘」。

打包应用会在启动后检查匹配的 GitHub 发布通道。通用设置可以控制自动检查与稳定版/预发布版选择。Windows 与 Linux 构建还支持自动下载和安装程序交接。未签名的 macOS 构建只发现更新并打开 Release 页面；请校验 `SHA256SUMS`，再手动安装匹配资产。

## 卸载

通过操作系统的应用管理器卸载 `.exe`、`.dmg`、`.deb` 和 `.rpm` 安装。便携归档与 AppImage 可直接删除解压文件。卸载应用不会删除共享的 Harness home；只有在不再需要其中的会话、设置、凭据与 profile 时，才另行删除 `~/.dsh`。
