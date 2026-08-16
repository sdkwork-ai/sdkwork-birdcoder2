# 部署 Web UI

[English](deployment.md) | 中文

本指南将 Web profile 部署到 Docker 或 Kubernetes。npx/本地运行器仍使用默认的 `http://127.0.0.1:7780`；容器部署使用 `4080`，因此两种模式可以在同一台机器上运行而不会端口冲突。

## Ubuntu 22.04 与 WSL 2 前置条件

以下命令需要 `amd64` 或 `arm64` 宿主机上的 Docker Engine、Compose 插件、`kubectl` 和 Minikube。请按照 [Ubuntu Docker Engine 指南](https://docs.docker.com/engine/install/ubuntu/)安装 Docker，或启用 Docker Desktop 的 WSL 集成，然后安装 Kubernetes 客户端，并在 clone 仓库前确认每条命令都可运行。

```sh
case "$(uname -m)" in
  x86_64|amd64) arch=amd64 ;;
  aarch64|arm64) arch=arm64 ;;
  *) echo 'unsupported container architecture' >&2; exit 1 ;;
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
docker compose version
kubectl version --client
minikube version
```

## 端口与信任

Web 服务器默认绑定 `127.0.0.1:7780`。对外网络部署必须设置 `DSH_WEB_HOST=0.0.0.0`、`DSH_WEB_PORT=4080` 和 `DSH_ALLOW_NON_LOOPBACK=1`；容器入口会将它们转换成 `--host 0.0.0.0 --port 4080 --allow-non-loopback`。

`DSH_TRUSTED_HOSTS` 是逗号分隔的浏览器 `Host` authority 列表，例如 `app.example.com` 或 `app.example.com:8443`。它保护 `/api` 浏览器信任围栏，但不提供认证、TLS 或 origin 策略。请将服务放在具备认证且终止 TLS 的反向代理或 Ingress 后面。

## Docker

### 构建镜像

请克隆仓库并在仓库根目录构建。多阶段镜像会编译并打包工作区，将发布校验使用的同一组 npm tarball 安装到普通 npm 消费方中，校验已安装的 CLI 和当前架构对应的 Landlock 启动器，安装 bubblewrap 以及 `dsh plugin` 使用的固定 pnpm 版本，并以 UID 10001 运行。包管理器的数据和缓存位于可写的 `/data` 卷下。

```sh
git clone https://github.com/sdkwork-ai/sdkwork-birdcoder2.git
cd sdkwork-birdcoder2
docker build -t localhost/deepseek-harness:local .
```

### 使用 Compose 运行

在 shell 中设置 `DEEPSEEK_API_KEY`，并可在启动 Compose 前设置 `DSH_TRUSTED_HOSTS`。直接监听地址默认为 `127.0.0.1:4080`；只有在宿主机已有进程占用该端口时才修改 `DSH_PUBLISH_PORT`。除非已发布的监听地址受到具备身份验证的反向代理保护，否则应让 `DSH_PUBLISH_HOST` 保持在环回地址。

```sh
DEEPSEEK_API_KEY=your-key DSH_TRUSTED_HOSTS=localhost,127.0.0.1 docker compose up -d --no-build --wait --wait-timeout 180
```

上述命令会启动从源码 clone 构建的镜像，并等待加固后的容器进入健康状态。GitHub Release 会提供原生 `linux/amd64` 与 `linux/arm64` 镜像归档、一个部署包，以及每个归档各自的 SHA-256 文件。将部署包及其 checksum、宿主架构对应的镜像及其 checksum 共四个文件下载到同一目录。打包后的 Compose 文件不包含只用于源码的构建部分，并使用 `docker load` 恢复的镜像标签；可通过 `DSH_IMAGE` 覆盖该标签。

```sh
version='X.Y.Z'
case "$(uname -m)" in
  x86_64|amd64) arch=amd64 ;;
  aarch64|arm64) arch=arm64 ;;
  *) echo 'unsupported container architecture' >&2; exit 1 ;;
esac
sha256sum -c "dsh-container-image-${version}-linux-${arch}.tar.gz.sha256"
sha256sum -c "dsh-container-${version}.tar.gz.sha256"
gzip -dc "dsh-container-image-${version}-linux-${arch}.tar.gz" | docker load
tar -xzf "dsh-container-${version}.tar.gz"
cd "dsh-container-${version}"
DEEPSEEK_API_KEY=your-key docker compose up -d --wait --wait-timeout 180
```

打开 `http://127.0.0.1:4080`。命名卷 `dsh-data` 保存 `$DSH_HOME`；`dsh-workspace` 保存默认 agent（智能体）的工作区。镜像健康检查请求 `/`，Web profile 挂载完成后该路径才会提供服务。

## Kubernetes

清单会创建一个副本、两个 `ReadWriteOnce` PVC、一个 ClusterIP Service、一个 NetworkPolicy，以及 HTTP 启动、就绪和存活探针。签入的清单使用 `localhost/deepseek-harness:local`；发布包使用同级镜像归档恢复的版本标签。应用 Kustomization 前，请将该镜像准确加载到每个目标节点。以下命令会构建源码 clone，将镜像保存为 Docker 归档，再把该归档加载到 Minikube。使用 kind 时，请将最后一条命令替换为 `kind load image-archive dsh-container-local.tar`。

```sh
docker build -t localhost/deepseek-harness:local .
docker save --output dsh-container-local.tar localhost/deepseek-harness:local
minikube start --driver=docker --container-runtime=containerd
minikube image load dsh-container-local.tar
```

离线安装 Release 时，请下载宿主架构对应的四个文件，并执行以下不会启动 Compose 的流程。它会校验两个摘要，将所选镜像产物转换为 Minikube 接受的归档格式，加载镜像，再进入解压后的部署包。使用 kind 时，请将 `minikube` 命令替换为 `kind load image-archive "dsh-container-image-${version}-linux-${arch}.tar"`。

```sh
version='X.Y.Z'
case "$(uname -m)" in
  x86_64|amd64) arch=amd64 ;;
  aarch64|arm64) arch=arm64 ;;
  *) echo 'unsupported container architecture' >&2; exit 1 ;;
esac
sha256sum -c "dsh-container-image-${version}-linux-${arch}.tar.gz.sha256"
sha256sum -c "dsh-container-${version}.tar.gz.sha256"
gzip -dc "dsh-container-image-${version}-linux-${arch}.tar.gz" > "dsh-container-image-${version}-linux-${arch}.tar"
minikube image load "dsh-container-image-${version}-linux-${arch}.tar"
tar -xzf "dsh-container-${version}.tar.gz"
cd "dsh-container-${version}"
```

应用 Kustomization 之前先创建 API key Secret。

```sh
kubectl create secret generic dsh-credentials \
  --from-literal=DEEPSEEK_API_KEY="$DEEPSEEK_API_KEY"
kubectl apply -k deploy/kubernetes
kubectl port-forward svc/dsh 4081:4080
```

端口转发就绪后打开 `http://127.0.0.1:4081`。Kubernetes 使用宿主机端口 `4081`，Docker 使用 `4080`，npx/本地运行器仍使用 `7780`。

如果集群不能接收预加载镜像，请将已加载的镜像推送到你控制的 registry，并从解压后部署包的根目录替换本地镜像名，再应用清单。

```sh
docker tag "localhost/deepseek-harness:${version}" "registry.example.com/deepseek-harness:${version}"
docker push "registry.example.com/deepseek-harness:${version}"
cd deploy/kubernetes
kustomize edit set image "localhost/deepseek-harness=registry.example.com/deepseek-harness:${version}"
kubectl apply -k .
```

如果需要外部 URL，请编辑 `deploy/kubernetes/configmap.yaml`，让 `DSH_TRUSTED_HOSTS` 包含 Ingress 的精确 authority。可选的 NGINX `ingress.example.yaml` 需要 `dsh-basic-auth` Secret，其中 `auth` 键包含 htpasswd 文件；它还需要 `dsh-tls` TLS Secret。请先创建二者，再应用该示例并重启 Deployment。其他 Ingress controller 必须提供等效的身份验证和 TLS。Ingress 必须保留 `/api` 下行连接所需的 WebSocket upgrade。

## 持久化数据

将 `/data` 挂载为 `$DSH_HOME`，将 `/workspace` 挂载为工作区根目录。数据 PVC 包含会话、附件、settings、凭据、存储投影、profiles 和 agent presets。不要把凭据写入镜像或 ConfigMap；请通过 Secret 或环境变量注入 `DEEPSEEK_API_KEY`。

Deployment 使用 `Recreate`，因为 JSONL 会话与存储文件属于单个副本的本地数据。扩容需要共享存储和应用级所有权设计；这些清单不提供该协调机制。

## 安全与运维

Web 载体没有内置 TLS 或认证。对可信网络之外开放前，请使用 Ingress 或反向代理提供认证、TLS、请求限制和访问策略。保持 `DSH_PERMISSION_MODE=workspace-write`；`danger-full-access` 会移除文件效果限制，不是容器加固设置。

除 `/data`、`/workspace` 和 `/tmp` 外，镜像根文件系统为只读。Compose 将 `/tmp` 作为内存中的 `noexec` 挂载提供。Kubernetes 使用内存 `emptyDir`；核心 `emptyDir` API 没有 mount option 字段，也不承诺 `noexec`。镜像直接从只读的已安装包加载 Node 内部模块原生辅助组件，而不将它复制到临时存储。镜像包含 `bash`、bubblewrap 和对应的 Landlock 启动器；沙箱会选择可用且能强制执行的后端。如果宿主既不支持 bubblewrap user namespace，也不支持 Landlock，shell 工具会安全失败。不要挂载 ServiceAccount token，也不要为了绕过该失败而添加 Linux capability。

探针使用 `GET /`，因为 Web 服务器没有无需认证的健康 endpoint。非 200 响应表示前端或 profile 尚未挂载；请先检查 `docker compose logs` 或 `kubectl logs`，再调整探针时间。

## 发布资产

`birdcoder-v<version>` 标签会构建原生 `linux/amd64` 与 `linux/arm64` 镜像，并加载每个已保存归档进行验证。工作流会校验并解压 `dsh-container-<version>.tar.gz`，验证其内部文件 manifest，再在 amd64 上使用解压后的 Compose 文件及其只读根、`noexec` 临时挂载和命名卷启动服务；它要求 HTTP 响应，并验证容器重建后两个命名卷的数据。统一 GitHub Release 会保留两个镜像及其 SHA-256 文件、部署包及其 checksum、所有受支持的 Desktop 安装包、更新元数据和汇总 checksum。工作流不登录镜像 registry，也不推送 registry 标签。手动运行会执行相同构建，并将文件保留为 30 天的 Actions artifact，而不创建 Release。npm 发布工作流保持独立；`pnpm run release:pack` 不包含 Docker 镜像。生产环境请固定运维方自有 registry 的标签或 digest，并随应用版本更新 Kustomize 镜像覆盖值。

## 排错

- **容器在监听前退出**：当 `DSH_WEB_HOST=0.0.0.0` 时检查 `DSH_ALLOW_NON_LOOPBACK=1`，并确认 `DSH_WEB_PORT` 是 1 到 65535 的整数。
- **页面能打开但 `/api` 返回 403**：将浏览器的精确 `Host` authority 加入 `DSH_TRUSTED_HOSTS`；不能用转发的 host header 替代它。
- **Pod 已就绪但 shell 工具失败**：检查沙箱日志和工作节点的 user namespace 策略；当 `bubblewrap` 或所需内核功能不可用时，镜像会安全失败。
- **重启后数据消失**：确认 `dsh-data` 和 `dsh-workspace` 都已挂载，并且 PVC 已绑定。
