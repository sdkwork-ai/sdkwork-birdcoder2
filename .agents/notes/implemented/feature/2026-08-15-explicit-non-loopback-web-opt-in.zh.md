# Agent Note: 显式启用非回环 Web 部署

Status: implemented

[English](2026-08-15-explicit-non-loopback-web-opt-in.md) | 中文

## 问题

容器和 Kubernetes 部署需要 Web 运行器接受 Service 或 ingress 转发的流量，但未经身份验证的 Web 载体不能因为误填 host 或复制命令行而意外暴露到网络。

## 决策

Web CLI 只有在同一次调用同时指定 `--allow-non-loopback` 时才接受 `--host 0.0.0.0`。对于其他 host，该 flag 会被拒绝；缺少该 flag 时，全接口 host 也会被拒绝。这一显式选择只改变绑定可达性，不增加身份验证、TLS、origin 策略，也不改变仍然固定为回环的那些方法的访问范围。部署必须将进程置于具备身份验证并终止 TLS 的边界之后，通过 `--trusted-host` 或 `trustedHosts` 声明服务 authority，并将持久化的 `DSH_HOME` 放在镜像之外。

## 曾考虑的替代方案

**永久禁止全接口绑定。** 不予采纳，因为受支持的容器或 Kubernetes 部署需要进程通过本地 Service 或反向代理接收流量。

**不加第二个 flag，直接允许 `--host 0.0.0.0`。** 不予采纳，因为复制的部署命令可能在没有明确承认面向网络模式的情况下暴露未经身份验证的载体。

**在本次变更中为 Web 载体增加身份验证。** 不予采纳，因为身份验证和 TLS 终止属于部署边界；载体的 Host/origin 栅栏仍是可达性策略，不能建立用户身份。

## 后果

默认的 `dsh web` 行为仍然只绑定回环地址。容器入口可以使用 `dsh web --host 0.0.0.0 --allow-non-loopback`，但镜像和清单必须提供外部信任 authority 以及具备身份验证的 ingress 或反向代理。配置、凭据、原生文件和 preset 创作等特权方法仍然只对回环客户端开放。启动测试覆盖两种被拒绝的 flag 组合和获准的显式组合。

决策背景：[显式指定 Web 绑定地址](2026-07-22-web-bind-address.zh.md)。
