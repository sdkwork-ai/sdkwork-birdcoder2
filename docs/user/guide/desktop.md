# Install the desktop application

English | [中文](desktop.zh.md)

The desktop application runs the same Web profile and stores the same Harness data as `npx @deepseek-ai/dsh@next web`, but it serves the UI through Electron IPC and opens no HTTP port. The npm `next` channel is published independently and may be older than this GitHub Release. The npx launcher remains on `7780`, Docker uses `4080`, and the Kubernetes local forward uses `4081`, so all modes can run together.

## Choose an asset

Open the [GitHub Releases page](https://github.com/sdkwork-ai/sdkwork-birdcoder2/releases), select the intended `birdcoder-v<version>` release, and download the file for the operating system and CPU architecture.

GitHub Latest currently points to `birdcoder-v0.1.0-rc.12`. Among fully verified regular releases, the highest SemVer tag holds the Latest pointer; select another tag only when pinning that version intentionally.

| Platform | Architecture | Installer | Portable archive |
|---|---|---|---|
| Windows | x64 or arm64 | `BirdCoder-<version>-win-<arch>.exe` | `BirdCoder-<version>-win-<arch>.zip` |
| macOS | x64 or arm64 | `BirdCoder-<version>-mac-<arch>.dmg` | `BirdCoder-<version>-mac-<arch>.zip` |
| Linux | x64 | `*-linux-x86_64.AppImage`, `*-linux-amd64.deb`, or `*-linux-x86_64.rpm` | `*-linux-x64.tar.gz` |
| Linux | arm64 | `*-linux-arm64.AppImage`, `*-linux-arm64.deb`, or `*-linux-aarch64.rpm` | `*-linux-arm64.tar.gz` |

The Release also contains `SHA256SUMS`, update metadata, a Docker/Kubernetes deployment bundle, and offline Linux container images. Container installation is covered by the [deployment guide](deployment.md).

## Verify the download

Download `SHA256SUMS` beside the selected asset. Verify only the selected line because the aggregate file also names Release assets that are not present locally. On Linux:

```sh
version='X.Y.Z'
asset="BirdCoder-${version}-linux-x86_64.AppImage"
awk -v name="$asset" '$2 == name' SHA256SUMS | sha256sum --check
```

On macOS, use the platform-provided `shasum` command:

```sh
version='X.Y.Z'
asset="BirdCoder-${version}-mac-x64.dmg"
awk -v name="$asset" '$2 == name' SHA256SUMS | shasum -a 256 --check
```

On Windows PowerShell, fail when the selected checksum is absent or different:

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

Release candidates are unsigned. Windows SmartScreen, macOS Gatekeeper, or a Linux desktop may therefore ask for confirmation. Verify the checksum and repository source before approving an operating-system prompt.

## Install

On Windows, run the `.exe` for an assisted per-user installation, or extract the `.zip` and launch `birdcoder.exe` without installing it.

On macOS, open the `.dmg` and move BirdCoder to Applications, or extract the `.zip`. An unsigned candidate may require opening the verified application from Finder's context menu.

On Debian or Ubuntu, install the `.deb` package:

```sh
version='X.Y.Z'
deb_arch='amd64'
sudo apt install "./BirdCoder-${version}-linux-${deb_arch}.deb"
```

On Fedora, RHEL, or another RPM-based distribution, install the `.rpm` package:

```sh
version='X.Y.Z'
rpm_arch='x86_64'
sudo rpm -Uvh "./BirdCoder-${version}-linux-${rpm_arch}.rpm"
```

The AppImage and tar archive are portable alternatives:

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

Set `deb_arch` to `amd64` or `arm64`, `rpm_arch` to `x86_64` or `aarch64`, and `appimage_arch` to `x86_64` or `arm64`. Set `tar_arch` to `x64` or `arm64`.

## First run and updates

Open **Settings -> Models** and configure a provider before starting a session. Desktop and npx launches share `$DSH_HOME` or `~/.dsh`, including profiles, settings, credentials, sessions, attachments, and workspaces. Closing the window keeps the app in the system tray by default; use the tray's Quit command or disable close-to-tray in General settings when a window close must stop the process.

Packaged applications check the matching GitHub release channel after startup. General settings controls automatic checks and stable/prerelease selection. Windows and Linux builds also support automatic download and installer handoff. Unsigned macOS builds only discover updates and open the Release page; verify `SHA256SUMS` and install the matching asset manually.

## Remove

Use the operating system's application manager for `.exe`, `.dmg`, `.deb`, and `.rpm` installations. Portable archives and AppImages can be removed by deleting their extracted files. Application removal does not delete the shared Harness home; remove `~/.dsh` separately only when its sessions, settings, credentials, and profiles are no longer needed.
