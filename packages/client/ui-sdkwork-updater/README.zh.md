# @deepseek-ai/dsh-client-ui-sdkwork-updater

[English](README.md) | 中文

Electron 壳层的桌面更新发现 UI。本插件以更新横幅占用 `shell.overlay`，并以更新偏好行占用 `settings.general.item`。它只随 `dsh-desktop-app` 组合包发布；Web 组合不会加载它，preload 不含 `desktopBridge.updates` 成员时，两项注册都不渲染内容。

主进程持有发现、下载、安装以及持久化的 `desktop` 设置命名空间。本包把 bridge 推送的更新状态镜像到两个 slot store，并通过 preload 把用户操作路由回主进程。横幅呈现可用版本、下载进度、发布说明、安装就绪状态以及 GitHub Release 链接。设置行控制静默检查、接受的发布通道（`follow`、`stable` 或 `rc`）、自动下载和手动检查。

安装版本为预发布版时，`follow` 接受预发布更新；安装稳定版后，它只跟随稳定版。主进程只检查已打包应用；源码启动会暴露禁用状态，且从不联系发布提供方。设置写入使用 `ctx.settingsScope`，并在同一命名空间的托盘与 updater 消费方之间实时生效。

## 模型体验

无，因为本插件只渲染桌面更新状态与偏好，不新增会话事件，也不改变模型请求。

#### KV Cache 影响

无；本包既不组装也不发送提供方请求。

## 已知限制与暂缓事项

- 候选版本的桌面产物尚未签名。操作系统可能拒绝自动安装或要求显式确认；在配置代码签名前，横幅的发布页操作与已发布的 SHA-256 校验和共同提供手动安装路径。
- 更新发现依赖规范的 `latest*.yml` 元数据与安装资产一同保留在匹配的 GitHub Release 中。
