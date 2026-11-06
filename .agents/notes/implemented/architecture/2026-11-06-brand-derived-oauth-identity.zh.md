# Agent Note：按品牌 URL scheme 派生桌面登录身份

Status: implemented

[English](2026-11-06-brand-derived-oauth-identity.md) | 中文

## 问题

桌面浏览器登录会呈现一个 OAuth 公共客户端并通过深链返回，IAM 平台为每个品牌注册一个客户端，回调也属于该品牌。`packages/host/sdkwork-oem/src/config.ts` 里的出厂默认值只写死了一个品牌的组合（`birdcoder` 与 `birdcoder://auth/callback`），于是其他品牌只能改这些常量，或自带一份声明自身组合的 OEM profile。把别的品牌的客户端配上本品牌回调的 profile，会得到一个授权服务器拒绝的登录：托管页无法启动授权（`OAuth redirect_uri is not registered for this client`），而这对不匹配的身份不满足 SDKWork 回调形状，页面连错误都交不回来。应用随后只能等流程到期，再报一个指错环节的通用失败。派生品牌合并上游源码时还会重新继承上游的常量，于是修一次要在每次同步后重做。

## 决定

OEM 解析器按启动进程所运行的品牌派生登录身份。Desktop 外壳在每次启动时把品牌清单里的 `desktop.protocol` 导出为 `DSH_BRAND_PROTOCOL`——打包启动、开发启动器、CLI 启动脚本、裸导入都包含在内——而 `resolveOemConfig` 对既未声明 `sdkwork.iamClientId` 也未声明 `sdkwork.iamRedirectUri` 的 profile 解析为 `<scheme>` 与 `<scheme>://auth/callback`。声明了其他客户端或回调的 profile 会在启动时失败，早于任何窗口呈现登录。

常量 `DEFAULT_IAM_CLIENT_ID` 与 `DEFAULT_IAM_REDIRECT_URI` 仍是出厂品牌的组合，只决定“没有报告 scheme 的启动”。它们不再是派生品牌身份的来源，因此从上游合并不会改变该品牌的登录，该品牌自己的常量也不会变成随时会爆的合并冲突。

于是一个品牌无需 profile 即可登录、无需给共享包打每个品牌一份的补丁、也无需共享 home：两个品牌各自从自己的品牌清单派生出两个客户端与两个回调，落错 home 的 profile 会响亮失败，而不是在重定向之后才失败。

## 考虑过的替代方案

**按品牌改常量。** 派生仓库现在就是这样做的。它对单个品牌有效，但每次合并都会重新继承上游的组合，于是上游一次默认值变更之后的同步就会弄坏登录。

**要求每个品牌自带 OEM profile。** profile 仍是覆盖其他所有源的方式，但把登录身份也变成必填会让一个正确的构建依赖仓库之外的部署数据，而缺失或过期的 profile 只在登录时才失败。

**接受任意已注册的客户端与回调组合。** 授权服务器确实会接受重定向指向别的品牌 scheme 的客户端，但该外壳永远收不到回调，流程只能超时。与运行 scheme 相等，是“一台安装一个品牌”的契约。

## 影响

`packages/host/sdkwork-oem` 拥有派生与拒绝，Desktop 外壳拥有报告 scheme 的责任。测试同时断言两者：合成的第二个品牌在没有任何 profile 时解析出自己的组合，而第一个品牌的组合出现在该 home 时启动失败。`packages/client/ui-primitives` 保留出厂组合，作为没有 OEM 投影的页面的兜底——这种页面本来也无法运行浏览器交接。

派生仓库新增品牌现在只需要品牌清单即可登录，前提是该品牌的租户注册了对应的客户端与回调。[OEM profile 参考](../../../../packages/host/sdkwork-oem/README.zh.md)陈述派生规则，[品牌清单参考](../../../../brands/README.zh.md)陈述 `desktop.protocol` 提供该身份。
