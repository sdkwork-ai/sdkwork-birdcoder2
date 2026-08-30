# Deploy the Web UI

English | [中文](deployment.zh.md)

This guide deploys the Web profile in Docker or Kubernetes. The npx/local runner keeps its default `http://127.0.0.1:7780`; container deployments use port `4080`, so both modes can run on one machine without a port collision.

## Ubuntu 22.04 and WSL 2 prerequisites

The commands below require Docker Engine with the Compose plugin, `kubectl`, and Minikube on an `amd64` or `arm64` host. Install Docker through the [Ubuntu Docker Engine guide](https://docs.docker.com/engine/install/ubuntu/) or enable Docker Desktop's WSL integration, then install the Kubernetes clients and verify every command before cloning the repository.

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

## Port and trust

The Web server binds `127.0.0.1:7780` by default. A network-facing deployment must set `DSH_WEB_HOST=0.0.0.0`, `DSH_WEB_PORT=4080`, and `DSH_ALLOW_NON_LOOPBACK=1`; the container entrypoint converts those values to `--host 0.0.0.0 --port 4080 --allow-non-loopback`.

`DSH_TRUSTED_HOSTS` is a comma-separated list of browser `Host` authorities, such as `app.example.com` or `app.example.com:8443`. It protects the `/api` browser trust fence but does not provide authentication, TLS, or an origin policy. Put the service behind an authenticated, TLS-terminating reverse proxy or Ingress.

## Docker

### Build an image

Clone the repository and build from its root. The multi-stage image compiles and packs the workspace, installs the same npm tarball set exercised by the release verifier into an ordinary npm consumer, verifies the installed CLI and architecture-specific Landlock launcher, installs bubblewrap and the pinned pnpm version used by `dsh plugin`, and runs as UID 10001. Package-manager data and caches live under the writable `/data` volume.

```sh
git clone https://github.com/sdkwork-ai/sdkwork-birdcoder2.git
cd sdkwork-birdcoder2
docker build -t localhost/deepseek-harness:local .
```

### Run with Compose

Set `DEEPSEEK_API_KEY` in the shell and optionally set `DSH_TRUSTED_HOSTS` before starting Compose. The direct listener defaults to `127.0.0.1:4080`; change `DSH_PUBLISH_PORT` only when another process already owns that host port. Keep `DSH_PUBLISH_HOST` on loopback unless an authenticated reverse proxy protects the published listener.

```sh
DEEPSEEK_API_KEY=your-key DSH_TRUSTED_HOSTS=localhost,127.0.0.1 docker compose up -d --no-build --wait --wait-timeout 180
```

That command starts the image built from the source clone and waits for the hardened container to become healthy. A GitHub Release provides native `linux/amd64` and `linux/arm64` image archives, one deployment bundle, and one SHA-256 file for each archive. Download the deployment bundle, its checksum, and the two files for the host architecture into one directory. The packaged Compose file has no source-only build section and uses the image tag restored by `docker load`; `DSH_IMAGE` may override that tag.

```sh
version='X.Y.Z'
case "$(uname -m)" in
  x86_64|amd64) arch=amd64 ;;
  aarch64|arm64) arch=arm64 ;;
  *) echo 'unsupported container architecture' >&2; exit 1 ;;
esac
sha256sum -c "birdcoder-container-image-${version}-linux-${arch}.tar.gz.sha256"
sha256sum -c "birdcoder-container-${version}.tar.gz.sha256"
gzip -dc "birdcoder-container-image-${version}-linux-${arch}.tar.gz" | docker load
tar -xzf "birdcoder-container-${version}.tar.gz"
cd "birdcoder-container-${version}"
DEEPSEEK_API_KEY=your-key docker compose up -d --wait --wait-timeout 180
```

Open `http://127.0.0.1:4080`. The named `dsh-data` volume stores `$DSH_HOME`; `dsh-workspace` stores the default agent workspace. The image health check requests `/`, which is served after the Web profile has mounted.

## Kubernetes

The manifests create one replica, two `ReadWriteOnce` claims, a ClusterIP Service, a NetworkPolicy, and HTTP startup/readiness/liveness probes. The checked-in manifests use `localhost/deepseek-harness:local`; the release bundle uses the versioned tag restored from its sibling image archive. Load that exact image into every target node before applying the kustomization. The following commands build a source clone, save the image in Docker archive format, and load that archive into Minikube. For kind, replace the final command with `kind load image-archive birdcoder-container-local.tar`.

```sh
docker build -t localhost/deepseek-harness:local .
docker save --output birdcoder-container-local.tar localhost/deepseek-harness:local
minikube start --driver=docker --container-runtime=containerd
minikube image load birdcoder-container-local.tar
```

For an offline Release deployment, download the four files for the host architecture and run the following sequence without starting Compose. It verifies both checksums, converts the selected image asset to the archive format accepted by Minikube, loads the image, and enters the extracted deployment bundle. For kind, replace the `minikube` command with `kind load image-archive "birdcoder-container-image-${version}-linux-${arch}.tar"`.

```sh
version='X.Y.Z'
case "$(uname -m)" in
  x86_64|amd64) arch=amd64 ;;
  aarch64|arm64) arch=arm64 ;;
  *) echo 'unsupported container architecture' >&2; exit 1 ;;
esac
sha256sum -c "birdcoder-container-image-${version}-linux-${arch}.tar.gz.sha256"
sha256sum -c "birdcoder-container-${version}.tar.gz.sha256"
gzip -dc "birdcoder-container-image-${version}-linux-${arch}.tar.gz" > "birdcoder-container-image-${version}-linux-${arch}.tar"
minikube image load "birdcoder-container-image-${version}-linux-${arch}.tar"
tar -xzf "birdcoder-container-${version}.tar.gz"
cd "birdcoder-container-${version}"
```

Create the API key as a Secret before applying the kustomization.

```sh
kubectl create secret generic dsh-credentials \
  --from-literal=DEEPSEEK_API_KEY="$DEEPSEEK_API_KEY"
kubectl apply -k deployments/kubernetes
kubectl port-forward svc/dsh 4081:4080
```

Open `http://127.0.0.1:4081` after the port-forward is ready. Kubernetes uses host port `4081`, Docker uses `4080`, and the npx/local runner remains on `7780`.

For a cluster that cannot accept a preloaded image, push the loaded image to a registry you control and replace the local image name from the extracted deployment bundle root before applying it.

```sh
docker tag "localhost/deepseek-harness:${version}" "registry.example.com/deepseek-harness:${version}"
docker push "registry.example.com/deepseek-harness:${version}"
cd deployments/kubernetes
kustomize edit set image "localhost/deepseek-harness=registry.example.com/deepseek-harness:${version}"
kubectl apply -k .
```

For an external URL, edit `deployments/kubernetes/configmap.yaml` so `DSH_TRUSTED_HOSTS` contains the exact Ingress authority. The optional NGINX `ingress.example.yaml` requires a `dsh-basic-auth` Secret whose `auth` key contains an htpasswd file and a `dsh-tls` TLS Secret; create both before applying the example and restarting the Deployment. Another Ingress controller must provide equivalent authentication and TLS. The Ingress must preserve WebSocket upgrades for the `/api` downlinks.

## Persistent data

Mount `/data` at `$DSH_HOME` and `/workspace` at the workspace root. The data claim contains sessions, attachments, settings, credentials, storage projections, profiles, and agent presets. Do not bake credentials into an image or a ConfigMap; inject `DEEPSEEK_API_KEY` through a Secret or the environment.

The Deployment uses `Recreate` because the JSONL session and storage files are local to one replica. Scale-out requires a shared storage and an application-level ownership design; the manifests do not provide that coordination.

## Security and operations

The Web carrier has no built-in TLS or authentication. Use an Ingress or reverse proxy with authentication, TLS, request limits, and an access policy before exposing it outside a trusted network. Keep `DSH_PERMISSION_MODE=workspace-write`; `danger-full-access` removes the file-effect restriction and is not a container hardening setting.

The image is read-only except for `/data`, `/workspace`, and `/tmp`. Compose supplies `/tmp` as an in-memory `noexec` mount. Kubernetes supplies an in-memory `emptyDir`; the core `emptyDir` API has no mount-option field and does not promise `noexec`. The image loads the Node-internals native helper directly from its read-only installed package rather than copying it to temporary storage. It carries `bash`, bubblewrap, and the matching Landlock launcher; the sandbox selects a usable enforcing backend. A host that supports neither bubblewrap user namespaces nor Landlock makes shell tools fail closed. Do not mount a ServiceAccount token or add Linux capabilities to work around that failure.

The probes use `GET /` because the Web server has no unauthenticated health endpoint. A non-200 response means the frontend or profile has not mounted, so inspect `docker compose logs` or `kubectl logs` before changing probe timings.

## Release assets

A `birdcoder-v<version>` tag builds native `linux/amd64` and `linux/arm64` images and loads each saved archive for validation. The workflow verifies and extracts `birdcoder-container-<version>.tar.gz`, validates its internal file manifest, then starts the extracted Compose file on amd64 with its read-only root, `noexec` temporary mount, and named volumes; it requires an HTTP response and verifies both named volumes across container recreation. The unified GitHub Release keeps both images, their SHA-256 files, the deployment bundle, its checksum, every supported Desktop installer, update metadata, and aggregate checksums. The workflow does not log in to an image registry or push a registry tag. A manual run performs the same builds and retains the files as 30-day Actions artifacts instead of creating a Release. The npm release workflow remains separate; `pnpm run release:pack` does not contain the Docker image. Pin an operator-owned registry tag or digest in production and update the Kustomize image override with the application version.

## Troubleshooting

- **The container exits before listening** — check `DSH_ALLOW_NON_LOOPBACK=1` when `DSH_WEB_HOST=0.0.0.0`, and verify that `DSH_WEB_PORT` is an integer from 1 to 65535.
- **The page loads but `/api` returns 403** — add the browser's exact `Host` authority to `DSH_TRUSTED_HOSTS`; forwarded host headers are not used as a substitute.
- **The pod is ready but shell tools fail** — inspect sandbox logs and the worker node's user-namespace policy; the image fails closed when `bubblewrap` or the required kernel feature is unavailable.
- **Data disappears after a restart** — verify that both `dsh-data` and `dsh-workspace` are mounted and that the claims are bound.
