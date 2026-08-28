# Agent Note: 显式指定 Web 绑定地址

Status: implemented

[English](2026-07-22-web-bind-address.md) | 中文

## 问题

Web 应用可以用 Host 用户的 authority 运行命令。同机使用只需要 loopback 可达性；CLI 若提供全接口模式，就会在没有 TLS 或明确代理约定时暗示支持网络部署。

HTTP 承载层还把绑定地址隐藏在 `startWebServer()` 内部，导致其他壳层无法在包边界明确表达自己的网络策略。

## 决策

`dsh web` 默认绑定 `127.0.0.1`。CLI（命令行界面）接受 `--host 0.0.0.0` 作为显式启用的全接口模式，并拒绝其他取值，使网络模式保持为一份规模小、经过审慎限定的约定。CLI 的全接口模式还必须通过 `--allow-non-loopback` 明确启用；[显式启用非回环 Web 部署](2026-08-15-explicit-non-loopback-web-opt-in.zh.md)记录了这项部署决策。进程令牌与浏览器 cookie 认证不扩大该部署约定（[决策](../architecture/2026-08-24-browser-token-authentication.zh.md)）。全接口模式仍然输出本机环回 URL，并在可用时输出第一个外部 IPv4 URL。

`WebServer` 仍要求 `host: '127.0.0.1' | '0.0.0.0'`，并在没有 fallback 的情况下传给 `node:http`。通用承载层让自定义组合策略显式留在包接口上；产品 CLI 持有更严格的 loopback 选择。

## 曾考虑的替代方案

**保留以 `0.0.0.0` 作为默认值。** 不予采纳，因为普通的同机使用不需要在全网范围内可达，也不应隐式获得这种可达性。

**使用布尔型暴露标志。** 最初不予采纳，因为 `--host 0.0.0.0` 直接说明最终的套接字行为，并与底层服务器选项一致，无需再引入第二套术语。后来的部署要求取代了这部分决定：现在由 `--allow-non-loopback` 为该 host 模式增加门控；[显式启用非回环 Web 部署](2026-08-15-explicit-non-loopback-web-opt-in.zh.md)记录了原因。

**保留不带 `--allow-non-loopback` 的显式 `--host 0.0.0.0` 模式。** 不予采纳，因为仅有认证并不能为工具型 Host 提供 TLS、转发语义或受支持的远程部署约定。

**在 `startWebServer()` 内设置默认值。** 不予采纳，因为承载层可能由多种壳层调用，没有依据替它们选择部署策略。要求传入 `host`，可使每次装配调用都明确作出这一选择。

## 后果

`dsh web` 的本地启动仍可通过 `http://127.0.0.1:3080` 访问；其他机器上的浏览器必须使用 `dsh web --host 0.0.0.0 --allow-non-loopback` 显式启用，并提供具备身份验证的部署边界。CLI 尚未开放自定义接口地址或 IPv6 模式，而以编程方式使用承载层的消费方仍保留这种灵活性。服务器测试将环回模式和全接口模式向 Node 监听边界的传递固定为约定，启动测试覆盖显式启用组合。
