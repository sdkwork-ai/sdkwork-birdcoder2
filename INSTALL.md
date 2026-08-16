# Install DeepSeek Harness

English | [中文](INSTALL.zh.md)

This guide installs a runnable DeepSeek Harness through every supported distribution path: npx, a source checkout, Docker built from source, an offline Docker Release archive, Kubernetes from source, an offline Kubernetes Release archive, or a packaged desktop application.

The commands below pin the repository's current version, `0.1.0-rc.13`, which is also the current GitHub Latest. GitHub publishes every fully verified `birdcoder-v*` artifact set as a regular Release, even when its SemVer contains `-rc`; among those public releases, the highest SemVer tag holds the Latest pointer. When a newer release is available, replace the pinned value with the version shown after `birdcoder-v` on the [GitHub Releases page](https://github.com/sdkwork-ai/sdkwork-birdcoder2/releases). An `-rc` version segment still identifies a release candidate.

## Choose an installation method

| Method | Use it when | Required software | Version source | Local address |
|---|---|---|---|---|
| Desktop application | You want a native Windows, macOS, or Linux application | No Node.js or Docker | GitHub Release | No HTTP port |
| npx Web UI | You want the shortest local Web setup | Node.js and npm/npx | npm `next` channel | `http://127.0.0.1:7780` |
| npx headless CLI | You want one command-line task | Node.js and npm/npx | npm `next` channel | No HTTP port |
| Source checkout | You want the exact GitHub tag or want to modify the code | Git, Node.js, Corepack, and pnpm | Git tag | `http://127.0.0.1:7780` |
| Docker from source | You want to build the container locally | Git, Docker Engine, and Docker Compose | Git tag | `http://127.0.0.1:4080` |
| Docker Release archive | You want the verified image without building it | Docker Engine, Docker Compose, and archive tools | GitHub Release | `http://127.0.0.1:4080` |
| Kubernetes from source | You want a locally built image in Minikube or kind | Git, Docker, kubectl, and Minikube or kind | Git tag | `http://127.0.0.1:4081` |
| Kubernetes Release archive | You want an offline Release image in a cluster | Docker, kubectl, archive tools, and a cluster | GitHub Release | `http://127.0.0.1:4081` with port-forward |

The default ports are deliberately distinct. npx and source launches use `7780`, Docker publishes `4080`, and the Kubernetes examples forward to `4081`. The desktop application uses Electron IPC and opens no HTTP port.

## Common setup

### Model credentials

The Web UI and desktop application can start without an API key. After opening the application, go to **Settings > Models**, add a provider, enter its API key, and save it. Then choose a workspace, create a session, and send a task.

Headless CLI, Docker, and Kubernetes examples use a DeepSeek key from the launch environment. Set it only in the shell that starts the application, and never commit it:

```sh
export DEEPSEEK_API_KEY='your-key'
# Optional custom DeepSeek-compatible endpoint:
export DEEPSEEK_BASE_URL='https://your-endpoint.example.com'
```

On Windows PowerShell:

```powershell
$env:DEEPSEEK_API_KEY = 'your-key'
# Optional custom DeepSeek-compatible endpoint:
$env:DEEPSEEK_BASE_URL = 'https://your-endpoint.example.com'
```

The optional `DEEPSEEK_BASE_URL` value must come from the launch environment. Do not place it in a project `.env` file. Web users can configure custom providers in the model settings instead.

### Data and network exposure

npx, source, and desktop launches use `$DSH_HOME`, or `~/.dsh` when it is unset. They share profiles, settings, credentials, sessions, attachments, and workspace records. Docker uses the `dsh-data` and `dsh-workspace` named volumes. Kubernetes uses the `dsh-data` and `dsh-workspace` persistent volume claims.

The Web server does not provide authentication or TLS. The default listeners remain on loopback. Before exposing any Web deployment to another machine, put it behind an authenticated TLS reverse proxy or Ingress and configure the exact browser authority in `DSH_TRUSTED_HOSTS`.

## Install with npx

### Requirements

Install Node.js `^22.19.0` or `>=24.0.0` from the [Node.js download page](https://nodejs.org/en/download), then confirm that Node.js and npx are available:

```sh
node --version
npx --version
```

The npx package uses the independently published npm `next` channel and can be older than the newest GitHub Release. Check the reported version before relying on an exact release:

```sh
npx @deepseek-ai/dsh@next --version
```

Use the source, container, or desktop instructions when the installed version must match a specific `birdcoder-v<version>` GitHub tag.

### Start the Web UI

Run the command from the directory that the agent should use as its default workspace:

```sh
npx @deepseek-ai/dsh@next web
```

Wait for `dsh web: http://127.0.0.1:7780`, then open [http://127.0.0.1:7780](http://127.0.0.1:7780). Configure a model, click **Choose workspace**, select the directory where the command was started, create a session, and send a task.

Verify the HTTP listener from another terminal:

```sh
curl --fail http://127.0.0.1:7780/
```

On Windows PowerShell:

```powershell
(Invoke-WebRequest http://127.0.0.1:7780/).StatusCode
```

Press `Ctrl+C` in the server terminal to stop it. If `7780` is already in use, select another local-only port without reusing the container ports:

```sh
npx @deepseek-ai/dsh@next web --port 3081
```

### Run one headless task

Set `DEEPSEEK_API_KEY`, change to the intended workspace, and run:

```sh
npx @deepseek-ai/dsh@next --profile headless "summarize this workspace"
```

The command creates and persists one session, prints the final answer, and exits. It opens no HTTP port. A completed task exits with status `0`; another termination reason exits with status `1`.

### Update or remove

npx resolves the selected npm channel when it runs, so no application directory needs updating or uninstalling. npm may keep a download cache. Removing that cache is optional and does not remove Harness data. Delete `~/.dsh` or `%USERPROFILE%\.dsh` only after backing up any sessions, settings, credentials, and profiles that must be retained.

## Run from a source checkout

### Requirements

Install these tools:

- Git 2.26 or newer.
- Node.js `^22.19.0` or `>=24.0.0`.
- Corepack-enabled pnpm. The repository pins pnpm `11.7.0`.

Confirm the toolchain:

```sh
git --version
node --version
corepack enable
pnpm --version
```

If `corepack` is unavailable in the selected Node.js distribution, install Corepack first, then rerun `corepack enable`.

### Clone and build

Clone the current Release tag, install its locked dependencies, and build the packages and Web frontend:

```sh
git clone --branch birdcoder-v0.1.0-rc.13 --depth 1 https://github.com/sdkwork-ai/sdkwork-birdcoder2.git
cd sdkwork-birdcoder2
corepack enable
corepack prepare pnpm@11.7.0 --activate
pnpm install --frozen-lockfile
pnpm run build
```

Omit `--branch birdcoder-v0.1.0-rc.13 --depth 1` only when intentionally following the development branch. A fresh checkout must complete `pnpm run build` before starting the production Web profile.

For local runs, copy the checked-in `.env.example` template to `.env` at the repo root to fill API keys such as `DEEPSEEK_API_KEY`; the file stays gitignored. Variables that decide how the process starts or reaches the network (`DEEPSEEK_BASE_URL`, `DSH_*`, proxies) must be exported in the launching shell instead of placed in `.env`.

### Start and verify

Start the Web UI:

```sh
pnpm dsh web
```

Open [http://127.0.0.1:7780](http://127.0.0.1:7780), configure a model, choose the checkout or another workspace, and run a task. Use the same curl or PowerShell verification shown in the npx section.

To run one command-line task instead:

```sh
pnpm dsh --profile headless "summarize this workspace"
```

The source launcher does not detect stale build output. Rerun `pnpm run build` after pulling or modifying code that affects packages or the Web frontend.

### Update or remove

To move an existing checkout to another tagged Release:

```sh
git fetch --tags
git checkout birdcoder-v0.1.0-rc.13
pnpm install --frozen-lockfile
pnpm run build
```

Stop running processes before deleting the checkout. Removing the checkout does not remove the shared Harness home.

## Build and run Docker from source

### Requirements

Install Git and Docker Engine with the Compose v2 plugin by following the [Docker Engine instructions](https://docs.docker.com/engine/install/) or install [Docker Desktop](https://docs.docker.com/desktop/). Windows and macOS Docker Desktop must run Linux containers.

```sh
git --version
docker version
docker compose version
```

The source container build does not require Node.js or pnpm on the host.

### Build and start

Clone the current tag and build its native image:

```sh
git clone --branch birdcoder-v0.1.0-rc.13 --depth 1 https://github.com/sdkwork-ai/sdkwork-birdcoder2.git
cd sdkwork-birdcoder2
docker build -t localhost/deepseek-harness:local .
```

On Linux, macOS, or WSL, set the key and start the image that was just built:

```sh
export DEEPSEEK_API_KEY='your-key'
docker compose up -d --no-build --wait --wait-timeout 180
```

On Windows PowerShell:

```powershell
$env:DEEPSEEK_API_KEY = 'your-key'
docker compose up -d --no-build --wait --wait-timeout 180
```

Open [http://127.0.0.1:4080](http://127.0.0.1:4080), choose a workspace, and run a task. Confirm the container and HTTP response:

```sh
docker compose ps
curl --fail http://127.0.0.1:4080/
```

Use `docker compose logs -f dsh` if the health check does not become healthy. To use another Docker host port, set `DSH_PUBLISH_PORT` before starting Compose; do not reuse `7780` or `4081`.

### Stop or remove

Stop the service while preserving both named volumes:

```sh
docker compose down --remove-orphans
```

Delete the service and its Harness data only when the stored sessions and workspaces are no longer needed:

```sh
docker compose down --volumes --remove-orphans
```

## Install the Docker Release archive

GitHub Releases provide native Linux images for `amd64` and `arm64`. There is no official image registry, so do not use `docker pull`. The deployment archive contains Compose and Kubernetes files but does not contain an image or Dockerfile; download it together with the image archive for the Docker engine's architecture.

### Download and verify

Run the following in Linux, macOS, or WSL. It detects the host architecture and downloads the current deployment archive, the matching image, and both checksum files:

```sh
version='0.1.0-rc.13'
base="https://github.com/sdkwork-ai/sdkwork-birdcoder2/releases/download/birdcoder-v${version}"
case "$(uname -m)" in
  x86_64|amd64) arch=amd64 ;;
  aarch64|arm64) arch=arm64 ;;
  *) echo 'unsupported container architecture' >&2; exit 1 ;;
esac

curl --fail --location --remote-name "$base/birdcoder-container-${version}.tar.gz"
curl --fail --location --remote-name "$base/birdcoder-container-${version}.tar.gz.sha256"
curl --fail --location --remote-name "$base/birdcoder-container-image-${version}-linux-${arch}.tar.gz"
curl --fail --location --remote-name "$base/birdcoder-container-image-${version}-linux-${arch}.tar.gz.sha256"

sha256sum --check "birdcoder-container-${version}.tar.gz.sha256"
sha256sum --check "birdcoder-container-image-${version}-linux-${arch}.tar.gz.sha256"
```

On macOS, replace both `sha256sum --check` commands with `shasum -a 256 --check`. On Windows, either run the commands in WSL or compare `Get-FileHash -Algorithm SHA256` with the first field in each downloaded `.sha256` file.

### Load and start

Load the image, extract the deployment archive, and start its packaged Compose file:

```sh
gzip -dc "birdcoder-container-image-${version}-linux-${arch}.tar.gz" | docker load
tar -xzf "birdcoder-container-${version}.tar.gz"
cd "birdcoder-container-${version}"
export DEEPSEEK_API_KEY='your-key'
docker compose up -d --wait --wait-timeout 180
docker compose ps
curl --fail http://127.0.0.1:4080/
```

PowerShell can load the compressed image with `docker load --input "birdcoder-container-image-<version>-linux-<arch>.tar.gz"`. The packaged Compose file already names `localhost/deepseek-harness:<version>`; do not run it with `--build` or `docker compose pull`.

Open [http://127.0.0.1:4080](http://127.0.0.1:4080). The stop and removal commands are the same as for Docker built from source.

## Prepare a local Kubernetes cluster

The checked-in Kubernetes deployment requires kubectl, a cluster with a default StorageClass, and an image available to every target node. The examples below use Minikube with Docker. The manifests create one replica, `5Gi` and `10Gi` `ReadWriteOnce` claims, a ClusterIP Service, a NetworkPolicy, and health probes.

### Install kubectl and Minikube on Ubuntu 22.04 or WSL 2

Install Docker first, then run:

```sh
case "$(uname -m)" in
  x86_64|amd64) arch=amd64 ;;
  aarch64|arm64) arch=arm64 ;;
  *) echo 'unsupported Kubernetes client architecture' >&2; exit 1 ;;
esac
tools_dir="$(mktemp -d)"
kubectl_version="$(curl --fail --show-error --silent --location https://dl.k8s.io/release/stable.txt)"
curl --fail --show-error --location \
  "https://dl.k8s.io/release/${kubectl_version}/bin/linux/${arch}/kubectl" \
  --output "${tools_dir}/kubectl"
curl --fail --show-error --location \
  "https://dl.k8s.io/release/${kubectl_version}/bin/linux/${arch}/kubectl.sha256" \
  --output "${tools_dir}/kubectl.sha256"
curl --fail --show-error --location \
  "https://storage.googleapis.com/minikube/releases/latest/minikube-linux-${arch}" \
  --output "${tools_dir}/minikube"
curl --fail --show-error --location \
  "https://storage.googleapis.com/minikube/releases/latest/minikube-linux-${arch}.sha256" \
  --output "${tools_dir}/minikube.sha256"
(cd "${tools_dir}" && printf '%s  kubectl\n' "$(cat kubectl.sha256)" | sha256sum --check)
(cd "${tools_dir}" && printf '%s  minikube\n' "$(cat minikube.sha256)" | sha256sum --check)
sudo install -m 0755 "${tools_dir}/kubectl" /usr/local/bin/kubectl
sudo install -m 0755 "${tools_dir}/minikube" /usr/local/bin/minikube
rm -f "${tools_dir}/kubectl" "${tools_dir}/kubectl.sha256" \
  "${tools_dir}/minikube" "${tools_dir}/minikube.sha256"
rmdir "${tools_dir}"

docker version
kubectl version --client
minikube version
```

On Windows or macOS, install Docker Desktop, kubectl, and Minikube using the [kubectl installation guide](https://kubernetes.io/docs/tasks/tools/) and [Minikube installation guide](https://minikube.sigs.k8s.io/docs/start/), then run the same three version checks.

## Deploy Kubernetes from source

### Build and load the image

Clone the current tag, build the image, start Minikube, and load the image archive into its container runtime:

```sh
git clone --branch birdcoder-v0.1.0-rc.13 --depth 1 https://github.com/sdkwork-ai/sdkwork-birdcoder2.git
cd sdkwork-birdcoder2
docker build -t localhost/deepseek-harness:local .
docker save --output birdcoder-container-local.tar localhost/deepseek-harness:local
minikube start --driver=docker --container-runtime=containerd
minikube image load birdcoder-container-local.tar
```

For kind, start a kind cluster and replace the final command with `kind load image-archive birdcoder-container-local.tar`.

### Apply and verify

Create the required Secret without writing the key into a manifest, apply the kustomization, and wait for the Deployment:

```sh
export DEEPSEEK_API_KEY='your-key'
kubectl create secret generic dsh-credentials \
  --from-literal=DEEPSEEK_API_KEY="$DEEPSEEK_API_KEY" \
  --dry-run=client --output=yaml | kubectl apply -f -
kubectl apply -k deploy/kubernetes
kubectl rollout status deployment/dsh --timeout=180s
kubectl get pods,pvc,svc
```

Keep the following command running in a separate terminal:

```sh
kubectl port-forward svc/dsh 4081:4080
```

Open [http://127.0.0.1:4081](http://127.0.0.1:4081), choose a workspace, and run a task. Verify it from another terminal:

```sh
curl --fail http://127.0.0.1:4081/
```

## Deploy the Kubernetes Release archive

### Download and load

Download and verify the same four Release files used by the Docker archive instructions, then start Minikube and load the Release image:

```sh
version='0.1.0-rc.13'
base="https://github.com/sdkwork-ai/sdkwork-birdcoder2/releases/download/birdcoder-v${version}"
case "$(uname -m)" in
  x86_64|amd64) arch=amd64 ;;
  aarch64|arm64) arch=arm64 ;;
  *) echo 'unsupported container architecture' >&2; exit 1 ;;
esac

curl --fail --location --remote-name "$base/birdcoder-container-${version}.tar.gz"
curl --fail --location --remote-name "$base/birdcoder-container-${version}.tar.gz.sha256"
curl --fail --location --remote-name "$base/birdcoder-container-image-${version}-linux-${arch}.tar.gz"
curl --fail --location --remote-name "$base/birdcoder-container-image-${version}-linux-${arch}.tar.gz.sha256"
sha256sum --check "birdcoder-container-${version}.tar.gz.sha256"
sha256sum --check "birdcoder-container-image-${version}-linux-${arch}.tar.gz.sha256"

minikube start --driver=docker --container-runtime=containerd
gzip -dc "birdcoder-container-image-${version}-linux-${arch}.tar.gz" \
  > "birdcoder-container-image-${version}-linux-${arch}.tar"
minikube image load "birdcoder-container-image-${version}-linux-${arch}.tar"
tar -xzf "birdcoder-container-${version}.tar.gz"
cd "birdcoder-container-${version}"
```

On macOS, use `shasum -a 256 --check` for both checksum files. For kind, replace the Minikube image-load command with `kind load image-archive "birdcoder-container-image-<version>-linux-<arch>.tar"`.

### Apply and verify

From the extracted deployment directory, create the Secret and deploy:

```sh
export DEEPSEEK_API_KEY='your-key'
kubectl create secret generic dsh-credentials \
  --from-literal=DEEPSEEK_API_KEY="$DEEPSEEK_API_KEY" \
  --dry-run=client --output=yaml | kubectl apply -f -
kubectl apply -k deploy/kubernetes
kubectl rollout status deployment/dsh --timeout=180s
kubectl get pods,pvc,svc
kubectl port-forward svc/dsh 4081:4080
```

Keep the port-forward running and open [http://127.0.0.1:4081](http://127.0.0.1:4081).

### Use a production cluster

The Release does not publish an official registry image. For a multi-node or remote cluster, load the archive into Docker, tag it for a registry you control, push it, and update the Kustomize image replacement before applying the manifests. Every scheduled node must be able to pull the selected architecture:

```sh
gzip -dc "birdcoder-container-image-${version}-linux-${arch}.tar.gz" | docker load
docker tag "localhost/deepseek-harness:${version}" "registry.example.com/deepseek-harness:${version}"
docker push "registry.example.com/deepseek-harness:${version}"
cd deploy/kubernetes
kustomize edit set image "localhost/deepseek-harness=registry.example.com/deepseek-harness:${version}"
kubectl apply -k .
kubectl rollout status deployment/dsh --timeout=180s
```

This production example additionally requires the standalone `kustomize` CLI. Before exposing the Service, configure the exact external authority in `configmap.yaml` and use an authenticated, TLS-terminating Ingress. `DSH_TRUSTED_HOSTS` is a host allowlist, not authentication.

### Stop or remove

Remove the workload while preserving the persistent volume claims:

```sh
kubectl delete deployment/dsh service/dsh configmap/dsh-config networkpolicy/dsh secret/dsh-credentials
minikube stop
```

Delete the claims or the complete Minikube cluster only when their sessions and workspaces are no longer needed:

```sh
kubectl delete pvc dsh-data dsh-workspace
minikube delete
```

## Install the desktop application

### Choose an asset

Open the [GitHub Releases page](https://github.com/sdkwork-ai/sdkwork-birdcoder2/releases), select `birdcoder-v0.1.0-rc.13` or a newer intended release, and download `SHA256SUMS` plus the asset for the operating system and CPU architecture.

| Platform | Architecture | Installer | Portable archive |
|---|---|---|---|
| Windows | x64 or arm64 | `BirdCoder-<version>-win-<arch>.exe` | `BirdCoder-<version>-win-<arch>.zip` |
| macOS | Intel x64 or Apple silicon arm64 | `BirdCoder-<version>-mac-<arch>.dmg` | `BirdCoder-<version>-mac-<arch>.zip` |
| Linux | x64 | `*-linux-x86_64.AppImage`, `*-linux-amd64.deb`, or `*-linux-x86_64.rpm` | `*-linux-x64.tar.gz` |
| Linux | arm64 | `*-linux-arm64.AppImage`, `*-linux-arm64.deb`, or `*-linux-aarch64.rpm` | `*-linux-arm64.tar.gz` |

Files named `latest*.yml` and `*.blockmap` are update metadata, not installers.

### Verify the download

On Linux, verify only the selected asset because `SHA256SUMS` also lists files that may not be downloaded:

```sh
version='0.1.0-rc.13'
asset="BirdCoder-${version}-linux-x86_64.AppImage"
awk -v name="$asset" '$2 == name' SHA256SUMS | sha256sum --check
```

On macOS:

```sh
version='0.1.0-rc.13'
asset="BirdCoder-${version}-mac-x64.dmg"
awk -v name="$asset" '$2 == name' SHA256SUMS | shasum -a 256 --check
```

On Windows PowerShell:

```powershell
$version = '0.1.0-rc.13'
$asset = "BirdCoder-$version-win-x64.exe"
$actual = (Get-FileHash -LiteralPath $asset -Algorithm SHA256).Hash.ToLowerInvariant()
$line = Get-Content .\SHA256SUMS | Where-Object { $_ -match "^[0-9a-f]{64}  $([regex]::Escape($asset))$" }
if ($null -eq $line) { throw "No checksum found for $asset" }
$expected = ($line -split '\s+', 2)[0]
if ($actual -ne $expected) { throw "Checksum mismatch for $asset" }
Write-Output "$asset checksum verified"
```

Release candidates are unsigned. Windows SmartScreen, macOS Gatekeeper, or a Linux desktop may ask for confirmation. Verify the checksum and repository source before approving that prompt.

### Install on Windows

Run the `.exe` for an assisted per-user installation. For a portable installation, extract the `.zip` and run `birdcoder.exe`. Choose Windows x64 for Intel or AMD PCs and Windows arm64 for an ARM-based PC.

### Install on macOS

Open the `.dmg`, then move BirdCoder to Applications. For a portable installation, extract the `.zip` and open the application bundle. Choose macOS x64 for an Intel Mac and macOS arm64 for Apple silicon. An unsigned candidate may require opening the verified application from Finder's context menu.

### Install on Linux

On Debian or Ubuntu:

```sh
version='0.1.0-rc.13'
deb_arch='amd64'
sudo apt install "./BirdCoder-${version}-linux-${deb_arch}.deb"
```

Set `deb_arch` to `arm64` on an ARM64 system.

On Fedora, RHEL, or another RPM-based distribution:

```sh
version='0.1.0-rc.13'
rpm_arch='x86_64'
sudo dnf install "./BirdCoder-${version}-linux-${rpm_arch}.rpm"
```

Set `rpm_arch` to `aarch64` on an ARM64 system.

The AppImage and tar archive are portable alternatives:

```sh
version='0.1.0-rc.13'
appimage_arch='x86_64'
tar_arch='x64'
chmod +x "BirdCoder-${version}-linux-${appimage_arch}.AppImage"
"./BirdCoder-${version}-linux-${appimage_arch}.AppImage"

mkdir birdcoder
tar -xzf "BirdCoder-${version}-linux-${tar_arch}.tar.gz" \
  --strip-components=1 -C birdcoder
./birdcoder/birdcoder
```

Use `appimage_arch=arm64` and `tar_arch=arm64` on an ARM64 system.

### First run, updates, and removal

Open **Settings > Models**, configure a provider, choose a workspace, and create a session. The desktop application opens no HTTP port. Closing its window keeps it in the system tray by default; use the tray's Quit command to stop it.

Packaged applications check their matching GitHub Release channel. Windows and Linux builds support automatic download and installer handoff. Unsigned macOS builds open the Release page for manual installation.

Use the operating system's application manager to remove an installer-based application. Delete extracted portable files or an AppImage directly. Removing the application does not remove the shared Harness home.

## Troubleshooting

- **The npx version is older than the GitHub Release:** npm and GitHub are independent release channels. Use the reported npx version, or install the exact Git tag through source, containers, or a desktop asset.
- **Port 7780, 4080, or 4081 is busy:** keep the three modes distinct. Use `--port` for npx/source, `DSH_PUBLISH_PORT` for Compose, or a different left-hand port in `kubectl port-forward`.
- **The page opens but the model is unavailable:** save a valid provider in **Settings > Models**, or confirm that the launch environment, Compose container, or Kubernetes Secret contains `DEEPSEEK_API_KEY`.
- **The Docker Release reports a missing image:** verify that `docker load` succeeded and that `docker image inspect localhost/deepseek-harness:<version>` works. The deployment archive alone is insufficient.
- **A Kubernetes pod reports `ErrImagePull` or `ImagePullBackOff`:** load the exact image into every node or change the Kustomize image replacement to a tag in a registry the cluster can pull.
- **The Web API returns 403 behind a proxy:** add the browser's exact host and optional port to `DSH_TRUSTED_HOSTS`; continue to provide authentication and TLS at the proxy or Ingress.
- **Shell tools report that the sandbox is unavailable:** verify the operating system's required sandbox support. Execution fails closed rather than running commands without isolation.
- **Data disappears after a container restart:** confirm that both Docker named volumes or both Kubernetes claims are present and mounted.

## Detailed references

- [Use the Web UI](docs/user/guide/index.md)
- [CLI modes and profiles](apps/cli/README.md)
- [Docker and Kubernetes deployment](docs/user/guide/deployment.md)
- [Desktop installation](docs/user/guide/desktop.md)
- [Model providers](docs/user/guide/providers.md)
