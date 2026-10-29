---
kind: upgrade-guide
description: "桌面浏览器登录改用 OAuth 客户端 `birdcoder` 与 `birdcoder://auth/callback`，不再使用已退役的 `sdkwork-birdcoder` 标识。"
---
# 桌面浏览器登录使用 birdcoder OAuth 客户端与深链

[English](guide.md) | 中文

## 变更

托管 SDKWork IAM 浏览器登录过去发送 `client_id` = `ui-sdkwork-env` 的 app id（`sdkwork-birdcoder`），并由该 id 派生 `sdkwork-birdcoder://auth/callback` 作为重定向。现在发送 OEM profile 的 `sdkwork.iamClientId` 与 `sdkwork.iamRedirectUri`，出厂值为 `birdcoder` 与 `birdcoder://auth/callback`。

API 租户标识不变：`ui-sdkwork-env` 的 `appId` 仍是 API 请求的租户键。只有 OAuth 客户端及其回调改变，因为授权服务器会用租户应用注册的依赖方配置校验这两项。

桌面外壳现在只在 scheme、authority 与 path 均等于已注册回调时接收深链。产品链接 `birdcoder://open` 与已退役的 `sdkwork-birdcoder` scheme 不再进入登录流程。

## 迁移

1. 在 SDKWork IAM 控制台为服务本部署的租户把 `birdcoder://auth/callback` 注册为公共 OAuth 客户端 `birdcoder` 的桌面重定向。
2. 若要保留已经注册的标识，请在启动本版本前，在 `$DSH_HOME/oem.json` 或随包发布的 `resources/oem.json` 中设置 `sdkwork.iamClientId` 与 `sdkwork.iamRedirectUri`。
3. 在 `brands/<key>.json` 中修改 `desktop.protocol` 的 OEM 品牌，必须把 `sdkwork.iamRedirectUri` 设为同一 scheme：打包外壳向操作系统注册它，其他 scheme 的重定向永远到不了应用。
4. 启动桌面应用，选择浏览器登录，确认托管页打开并通过已注册回调返回为已登录会话。被拒绝的回调会让登录界面停留在失败状态；此时重试仍失败说明控制台注册与 profile 不一致。
