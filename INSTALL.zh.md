# 安装 DeepSeek Harness

[English](INSTALL.md) | 中文

本指南介绍 DeepSeek Harness 的所有受支持分发方式，并最终得到可运行的应用：npx、源码 checkout、从源码构建 Docker、Docker Release 离线包、从源码部署 Kubernetes、Kubernetes Release 离线包，以及打包后的桌面应用。

以下命令固定使用仓库当前版本 `0.1.0-rc.13`，它也是当前的 GitHub Latest。GitHub 会将每个通过全部产物校验的 `birdcoder-v*` 发布标记为普通 Release，即使其 SemVer 包含 `-rc`；在这些公开 Release 中，SemVer 最高的 tag 持有 Latest。出现更新版本时，请在 [GitHub Releases 页面](https://github.com/sdkwork-ai/sdkwork-birdcoder2/releases)查看 `birdcoder-v` 后面的版本号，并替换固定值。版本中的 `-rc` 段仍表示候选版本。

## 选择安装方式

| 方式 | 适用场景 | 所需软件 | 版本来源 | 本地地址 |
|---|---|---|---|---|
| 桌面应用 | 需要原生 Windows、macOS 或 Linux 应用 | 不需要 Node.js 或 Docker | GitHub Release | 不打开 HTTP 端口 |
| npx Web UI | 需要最短的本地 Web 启动流程 | Node.js 和 npm/npx | npm `next` 渠道 | `http://127.0.0.1:7780` |
| npx headless CLI | 需要执行一次命令行任务 | Node.js 和 npm/npx | npm `next` 渠道 | 不打开 HTTP 端口 |
| 源码 checkout | 需要准确的 GitHub tag 或修改代码 | Git、Node.js、Corepack 和 pnpm | Git tag | `http://127.0.0.1:7780` |
| 从源码构建 Docker | 需要在本机构建容器 | Git、Docker Engine 和 Docker Compose | Git tag | `http://127.0.0.1:4080` |
| Docker Release 离线包 | 需要免构建的已验证镜像 | Docker Engine、Docker Compose 和归档工具 | GitHub Release | `http://127.0.0.1:4080` |
| 从源码部署 Kubernetes | 需要在 Minikube 或 kind 中使用本地构建的镜像 | Git、Docker、kubectl、Minikube 或 kind | Git tag | `http://127.0.0.1:4081` |
| Kubernetes Release 离线包 | 需要在集群中使用离线 Release 镜像 | Docker、kubectl、归档工具和集群 | GitHub Release | 使用 port-forward 时为 `http://127.0.0.1:4081` |

默认端口经过有意区分。npx 和源码方式使用 `7780`，Docker 发布到 `4080`，Kubernetes 示例转发到 `4081`。桌面应用使用 Electron IPC，不打开 HTTP 端口。

## 通用设置

### 模型凭据

Web UI 和桌面应用可以不带 API key 启动。打开应用后，进入**设置 > 模型**，添加提供方、输入 API key 并保存。然后选择工作区，创建会话并发送任务。

headless CLI、Docker 和 Kubernetes 示例从启动环境读取 DeepSeek key。只在启动应用的 shell 中设置，不要提交到仓库：

```sh
export DEEPSEEK_API_KEY='your-key'
# Optional custom DeepSeek-compatible endpoint:
export DEEPSEEK_BASE_URL='https://your-endpoint.example.com'
```

在 Windows PowerShell 中：

```powershell
$env:DEEPSEEK_API_KEY = 'your-key'
# Optional custom DeepSeek-compatible endpoint:
$env:DEEPSEEK_BASE_URL = 'https://your-endpoint.example.com'
```

可选的 `DEEPSEEK_BASE_URL` 必须来自启动环境，不要放进项目的 `.env` 文件。Web 用户可以改为在模型设置中配置自定义提供方。

### 数据与网络暴露

npx、源码和桌面方式使用 `$DSH_HOME`；未设置时使用 `~/.dsh`。这些方式共享 profile、设置、凭据、会话、附件和工作区记录。Docker 使用 `dsh-data` 和 `dsh-workspace` 命名卷。Kubernetes 使用 `dsh-data` 和 `dsh-workspace` 持久卷声明。

Web 服务不提供身份认证或 TLS。默认监听地址仅限 loopback。将任何 Web 部署暴露给其他计算机之前，必须放在带身份认证和 TLS 的反向代理或 Ingress 后，并在 `DSH_TRUSTED_HOSTS` 中配置浏览器使用的准确 authority。

## 使用 npx 安装

### 前置条件

从 [Node.js 下载页面](https://nodejs.org/en/download)安装 Node.js `^22.19.0` 或 `>=24.0.0`，然后确认 Node.js 和 npx 可用：

```sh
node --version
npx --version
```

npx 包使用单独发布的 npm `next` 渠道，版本可能早于最新 GitHub Release。依赖准确版本之前，请先检查输出的版本号：

```sh
npx @deepseek-ai/dsh@next --version
```

必须匹配某个 `birdcoder-v<version>` GitHub tag 时，请使用源码、容器或桌面安装方式。

### 启动 Web UI

在需要作为智能体默认工作区的目录中运行：

```sh
npx @deepseek-ai/dsh@next web
```

等待输出 `dsh web: http://127.0.0.1:7780`，然后打开 [http://127.0.0.1:7780](http://127.0.0.1:7780)。配置模型，点击**选择工作区**，选择启动命令时所在的目录，创建会话并发送任务。

在另一个终端中验证 HTTP 监听：

```sh
curl --fail http://127.0.0.1:7780/
```

在 Windows PowerShell 中：

```powershell
(Invoke-WebRequest http://127.0.0.1:7780/).StatusCode
```

在服务终端中按 `Ctrl+C` 停止。如果 `7780` 已被占用，请选择另一个仅本地使用的端口，不要复用容器端口：

```sh
npx @deepseek-ai/dsh@next web --port 3081
```

### 执行一次 headless 任务

设置 `DEEPSEEK_API_KEY`，进入目标工作区并运行：

```sh
npx @deepseek-ai/dsh@next --profile headless "summarize this workspace"
```

该命令会创建并持久化一个会话，输出最终回答后退出，不打开 HTTP 端口。任务正常完成时退出状态为 `0`，其他结束原因的退出状态为 `1`。

### 更新或移除

npx 每次运行时解析所选 npm 渠道，因此没有需要更新或卸载的应用目录。npm 可能保留下载缓存；删除该缓存是可选操作，也不会删除 Harness 数据。只有在备份了必须保留的会话、设置、凭据和 profile 后，才能删除 `~/.dsh` 或 `%USERPROFILE%\.dsh`。

## 从源码 checkout 运行

### 前置条件

安装以下工具：

- Git 2.26 或更高版本。
- Node.js `^22.19.0` 或 `>=24.0.0`。
- 启用 Corepack 的 pnpm。仓库固定使用 pnpm `11.7.0`。

确认工具链：

```sh
git --version
node --version
corepack enable
pnpm --version
```

如果所选 Node.js 发行版不提供 `corepack`，请先安装 Corepack，再重新运行 `corepack enable`。

### Clone 并构建

Clone 当前 Release tag，安装锁定的依赖，并构建所有包与 Web 前端：

```sh
git clone --branch birdcoder-v0.1.0-rc.13 --depth 1 https://github.com/sdkwork-ai/sdkwork-birdcoder2.git
cd sdkwork-birdcoder2
corepack enable
corepack prepare pnpm@11.7.0 --activate
pnpm install --frozen-lockfile
pnpm run build
```

只有明确要跟随开发分支时才省略 `--branch birdcoder-v0.1.0-rc.13 --depth 1`。全新 checkout 必须先完成 `pnpm run build`，然后才能启动生产 Web profile。

本地运行时，把与目标环境匹配的受跟踪物化文件（`.env.standalone.development`、`.env.standalone.test` 或 `.env.standalone.production`）复制为仓库根目录的 `.env`，填入 `DEEPSEEK_API_KEY` 等 API 密钥；该文件保持被 gitignore。`dsh` CLI 与桌面壳会在启动时自动生成 development/test 的 bootstrap access token（参见 `pnpm run env:token:ensure`）；`pnpm run admin:bootstrap:app` 向 IAM 后端注册应用。决定进程如何启动或如何联网的变量（`DEEPSEEK_BASE_URL`、`DSH_*`、代理）必须由启动 shell 导出，不能写进 `.env`。

### 启动并验证

启动 Web UI：

```sh
pnpm dsh web
```

打开 [http://127.0.0.1:7780](http://127.0.0.1:7780)，配置模型，选择当前 checkout 或另一个工作区，然后运行任务。使用 npx 小节中的同一条 curl 或 PowerShell 命令完成验证。

如需改为执行一次命令行任务：

```sh
pnpm dsh --profile headless "summarize this workspace"
```

源码启动器不会检测过期的构建产物。拉取或修改影响包或 Web 前端的代码后，请重新运行 `pnpm run build`。

### 更新或移除

将现有 checkout 切换到另一个带 tag 的 Release：

```sh
git fetch --tags
git checkout birdcoder-v0.1.0-rc.13
pnpm install --frozen-lockfile
pnpm run build
```

删除 checkout 前先停止运行中的进程。删除 checkout 不会移除共享的 Harness home。

## 从源码构建并运行 Docker

### 前置条件

按照 [Docker Engine 指南](https://docs.docker.com/engine/install/)安装 Git、Docker Engine 和 Compose v2 插件，或安装 [Docker Desktop](https://docs.docker.com/desktop/)。Windows 和 macOS Docker Desktop 必须运行 Linux 容器。

```sh
git --version
docker version
docker compose version
```

从源码构建容器不要求宿主机安装 Node.js 或 pnpm。

### 构建并启动

Clone 当前 tag 并构建原生架构镜像：

```sh
git clone --branch birdcoder-v0.1.0-rc.13 --depth 1 https://github.com/sdkwork-ai/sdkwork-birdcoder2.git
cd sdkwork-birdcoder2
docker build -t localhost/deepseek-harness:local .
```

在 Linux、macOS 或 WSL 中设置 key，并启动刚刚构建的镜像：

```sh
export DEEPSEEK_API_KEY='your-key'
docker compose up -d --no-build --wait --wait-timeout 180
```

在 Windows PowerShell 中：

```powershell
$env:DEEPSEEK_API_KEY = 'your-key'
docker compose up -d --no-build --wait --wait-timeout 180
```

打开 [http://127.0.0.1:4080](http://127.0.0.1:4080)，选择工作区并运行任务。确认容器状态和 HTTP 响应：

```sh
docker compose ps
curl --fail http://127.0.0.1:4080/
```

健康检查未进入 healthy 状态时，运行 `docker compose logs -f dsh`。如需更换 Docker 宿主机端口，请在启动 Compose 前设置 `DSH_PUBLISH_PORT`；不要复用 `7780` 或 `4081`。

### 停止或移除

停止服务并保留两个命名卷：

```sh
docker compose down --remove-orphans
```

只有在不再需要已存储的会话和工作区时，才删除服务及其 Harness 数据：

```sh
docker compose down --volumes --remove-orphans
```

## 安装 Docker Release 离线包

GitHub Releases 提供 `amd64` 和 `arm64` 两种原生 Linux 镜像。项目没有官方镜像仓库，因此不要使用 `docker pull`。部署包只包含 Compose 和 Kubernetes 文件，不包含镜像或 Dockerfile；必须同时下载与 Docker engine 架构匹配的镜像包。

### 下载并校验

在 Linux、macOS 或 WSL 中运行以下命令。它会检测宿主机架构，并下载当前部署包、匹配的镜像及两份校验和文件：

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

在 macOS 中，将两条 `sha256sum --check` 命令替换为 `shasum -a 256 --check`。在 Windows 中，可以在 WSL 内运行上述命令，也可以用 `Get-FileHash -Algorithm SHA256` 与每个已下载 `.sha256` 文件的第一列比较。

### 加载并启动

加载镜像，解压部署包，并启动其中已经打包的 Compose 文件：

```sh
gzip -dc "birdcoder-container-image-${version}-linux-${arch}.tar.gz" | docker load
tar -xzf "birdcoder-container-${version}.tar.gz"
cd "birdcoder-container-${version}"
export DEEPSEEK_API_KEY='your-key'
docker compose up -d --wait --wait-timeout 180
docker compose ps
curl --fail http://127.0.0.1:4080/
```

PowerShell 可以通过 `docker load --input "birdcoder-container-image-<version>-linux-<arch>.tar.gz"` 加载压缩镜像。打包后的 Compose 文件已经引用 `localhost/deepseek-harness:<version>`；不要使用 `--build` 或 `docker compose pull` 运行它。

打开 [http://127.0.0.1:4080](http://127.0.0.1:4080)。停止与移除命令和从源码构建 Docker 时相同。

## 准备本地 Kubernetes 集群

仓库中的 Kubernetes 部署要求 kubectl、带默认 StorageClass 的集群，以及每个目标节点都可用的镜像。以下示例使用 Docker 驱动的 Minikube。清单会创建一个副本、`5Gi` 和 `10Gi` 两个 `ReadWriteOnce` 声明、ClusterIP Service、NetworkPolicy 和健康探针。

### 在 Ubuntu 22.04 或 WSL 2 中安装 kubectl 和 Minikube

先安装 Docker，然后运行：

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

在 Windows 或 macOS 中，请按照 [kubectl 安装指南](https://kubernetes.io/docs/tasks/tools/)和 [Minikube 安装指南](https://minikube.sigs.k8s.io/docs/start/)安装 Docker Desktop、kubectl 和 Minikube，然后运行相同的三个版本检查命令。

## 从源码部署 Kubernetes

### 构建并加载镜像

Clone 当前 tag、构建镜像、启动 Minikube，并将镜像归档加载到其容器运行时：

```sh
git clone --branch birdcoder-v0.1.0-rc.13 --depth 1 https://github.com/sdkwork-ai/sdkwork-birdcoder2.git
cd sdkwork-birdcoder2
docker build -t localhost/deepseek-harness:local .
docker save --output birdcoder-container-local.tar localhost/deepseek-harness:local
minikube start --driver=docker --container-runtime=containerd
minikube image load birdcoder-container-local.tar
```

使用 kind 时，先启动 kind 集群，再将最后一条命令替换为 `kind load image-archive birdcoder-container-local.tar`。

### 应用并验证

创建必需的 Secret，并避免将 key 写入清单；然后应用 kustomization 并等待 Deployment：

```sh
export DEEPSEEK_API_KEY='your-key'
kubectl create secret generic dsh-credentials \
  --from-literal=DEEPSEEK_API_KEY="$DEEPSEEK_API_KEY" \
  --dry-run=client --output=yaml | kubectl apply -f -
kubectl apply -k deploy/kubernetes
kubectl rollout status deployment/dsh --timeout=180s
kubectl get pods,pvc,svc
```

在单独的终端中保持以下命令运行：

```sh
kubectl port-forward svc/dsh 4081:4080
```

打开 [http://127.0.0.1:4081](http://127.0.0.1:4081)，选择工作区并运行任务。在另一个终端中验证：

```sh
curl --fail http://127.0.0.1:4081/
```

## 部署 Kubernetes Release 离线包

### 下载并加载

下载并校验 Docker 离线包说明中使用的同四个 Release 文件，然后启动 Minikube 并加载 Release 镜像：

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

在 macOS 中，对两份校验和文件使用 `shasum -a 256 --check`。使用 kind 时，将 Minikube 镜像加载命令替换为 `kind load image-archive "birdcoder-container-image-<version>-linux-<arch>.tar"`。

### 应用并验证

在解压后的部署目录中创建 Secret 并部署：

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

保持 port-forward 运行，并打开 [http://127.0.0.1:4081](http://127.0.0.1:4081)。

### 使用生产集群

Release 不提供官方 registry 镜像。对于多节点或远程集群，请先将归档加载到 Docker，为镜像添加自有 registry tag 并推送，然后在应用清单前更新 Kustomize 镜像替换。每个可能调度到的节点都必须能够拉取所选架构的镜像：

```sh
gzip -dc "birdcoder-container-image-${version}-linux-${arch}.tar.gz" | docker load
docker tag "localhost/deepseek-harness:${version}" "registry.example.com/deepseek-harness:${version}"
docker push "registry.example.com/deepseek-harness:${version}"
cd deploy/kubernetes
kustomize edit set image "localhost/deepseek-harness=registry.example.com/deepseek-harness:${version}"
kubectl apply -k .
kubectl rollout status deployment/dsh --timeout=180s
```

该生产示例还需要独立的 `kustomize` CLI。暴露 Service 前，请在 `configmap.yaml` 中配置准确的外部 authority，并使用提供身份认证和 TLS 终止的 Ingress。`DSH_TRUSTED_HOSTS` 是 Host allowlist，不是身份认证。

### 停止或移除

移除工作负载并保留持久卷声明：

```sh
kubectl delete deployment/dsh service/dsh configmap/dsh-config networkpolicy/dsh secret/dsh-credentials
minikube stop
```

只有在不再需要其中的会话和工作区时，才删除持久卷声明或整个 Minikube 集群：

```sh
kubectl delete pvc dsh-data dsh-workspace
minikube delete
```

## 安装桌面应用

### 选择安装包

打开 [GitHub Releases 页面](https://github.com/sdkwork-ai/sdkwork-birdcoder2/releases)，选择 `birdcoder-v0.1.0-rc.13` 或更新的目标 Release，并下载 `SHA256SUMS` 以及与操作系统和 CPU 架构匹配的文件。

| 平台 | 架构 | 安装包 | 便携归档 |
|---|---|---|---|
| Windows | x64 或 arm64 | `BirdCoder-<version>-win-<arch>.exe` | `BirdCoder-<version>-win-<arch>.zip` |
| macOS | Intel x64 或 Apple silicon arm64 | `BirdCoder-<version>-mac-<arch>.dmg` | `BirdCoder-<version>-mac-<arch>.zip` |
| Linux | x64 | `*-linux-x86_64.AppImage`、`*-linux-amd64.deb` 或 `*-linux-x86_64.rpm` | `*-linux-x64.tar.gz` |
| Linux | arm64 | `*-linux-arm64.AppImage`、`*-linux-arm64.deb` 或 `*-linux-aarch64.rpm` | `*-linux-arm64.tar.gz` |

名为 `latest*.yml` 和 `*.blockmap` 的文件是更新元数据，不是安装包。

### 校验下载文件

在 Linux 中只校验所选文件，因为 `SHA256SUMS` 还会列出本地可能没有下载的其他文件：

```sh
version='0.1.0-rc.13'
asset="BirdCoder-${version}-linux-x86_64.AppImage"
awk -v name="$asset" '$2 == name' SHA256SUMS | sha256sum --check
```

在 macOS 中：

```sh
version='0.1.0-rc.13'
asset="BirdCoder-${version}-mac-x64.dmg"
awk -v name="$asset" '$2 == name' SHA256SUMS | shasum -a 256 --check
```

在 Windows PowerShell 中：

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

Release 候选版本没有签名，Windows SmartScreen、macOS Gatekeeper 或 Linux 桌面可能要求确认。确认操作系统提示前，请先验证校验和与仓库来源。

### 在 Windows 中安装

运行 `.exe` 完成当前用户的交互式安装。如需便携安装，请解压 `.zip` 并运行 `birdcoder.exe`。Intel 或 AMD PC 选择 Windows x64，ARM PC 选择 Windows arm64。

### 在 macOS 中安装

打开 `.dmg`，然后将 BirdCoder 移动到 Applications。如需便携安装，请解压 `.zip` 并打开其中的应用 bundle。Intel Mac 选择 macOS x64，Apple silicon 选择 macOS arm64。未签名的候选版本可能需要从 Finder 右键菜单打开已经验证的应用。

### 在 Linux 中安装

在 Debian 或 Ubuntu 中：

```sh
version='0.1.0-rc.13'
deb_arch='amd64'
sudo apt install "./BirdCoder-${version}-linux-${deb_arch}.deb"
```

ARM64 系统将 `deb_arch` 设为 `arm64`。

在 Fedora、RHEL 或其他 RPM 系发行版中：

```sh
version='0.1.0-rc.13'
rpm_arch='x86_64'
sudo dnf install "./BirdCoder-${version}-linux-${rpm_arch}.rpm"
```

ARM64 系统将 `rpm_arch` 设为 `aarch64`。

AppImage 和 tar 归档是便携安装方式：

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

ARM64 系统使用 `appimage_arch=arm64` 和 `tar_arch=arm64`。

### 首次运行、更新与移除

打开**设置 > 模型**，配置提供方，选择工作区并创建会话。桌面应用不打开 HTTP 端口。默认关闭窗口后进程仍保留在系统托盘中；请使用托盘中的退出命令停止应用。

打包后的应用会检查对应的 GitHub Release 渠道。Windows 和 Linux 版本支持自动下载和转交安装程序。未签名的 macOS 版本会打开 Release 页面，由用户手动安装。

使用操作系统的应用管理器移除通过安装包安装的应用。便携文件或 AppImage 可以直接删除。移除应用不会删除共享的 Harness home。

## 常见问题

- **npx 版本早于 GitHub Release：** npm 与 GitHub 是独立发布渠道。可以继续使用 npx 显示的版本，或通过源码、容器、桌面安装包安装准确的 Git tag。
- **端口 7780、4080 或 4081 已被占用：** 保持三种模式使用不同端口。npx/源码使用 `--port`，Compose 使用 `DSH_PUBLISH_PORT`，Kubernetes 修改 `kubectl port-forward` 左侧端口。
- **页面可以打开但模型不可用：** 在**设置 > 模型**中保存有效提供方，或确认启动环境、Compose 容器或 Kubernetes Secret 包含 `DEEPSEEK_API_KEY`。
- **Docker Release 提示镜像不存在：** 确认 `docker load` 成功，并且 `docker image inspect localhost/deepseek-harness:<version>` 可用。只有部署包无法启动。
- **Kubernetes Pod 出现 `ErrImagePull` 或 `ImagePullBackOff`：** 将准确镜像加载到每个节点，或把 Kustomize 镜像替换改为集群能够拉取的 registry tag。
- **通过代理访问时 Web API 返回 403：** 将浏览器使用的准确 host 和可选端口加入 `DSH_TRUSTED_HOSTS`；代理或 Ingress 仍必须提供身份认证与 TLS。
- **shell 工具报告 sandbox 不可用：** 检查操作系统要求的 sandbox 支持。系统会失败关闭，不会在缺少隔离的情况下执行命令。
- **容器重启后数据消失：** 确认两个 Docker 命名卷或两个 Kubernetes 声明都存在并已挂载。

## 详细参考

- [使用 Web UI](docs/user/guide/index.md)
- [CLI 模式与 profile](apps/cli/README.md)
- [Docker 与 Kubernetes 部署](docs/user/guide/deployment.md)
- [桌面应用安装](docs/user/guide/desktop.md)
- [模型提供方](docs/user/guide/providers.md)
