---
description: "SDKWork 个人主页插件：设置中的个人主页分区，展示已登录的 SDKWork 账号（个人与企业），并提供第二个退出登录入口；两者都通过 ui-sdkwork-iam 服务读取数据。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-profile

[English](README.md) | 中文

## 概述

SDKWork 个人主页插件：注册一个设置分区（id `profile`，order `-190`，紧跟「通用」之后），把已登录账号呈现为个人主页 —— 个人账号与会话所属的企业组织 —— 列出共用该账号的 SDKWork 产品，并在设置弹层底部退出登录之外提供第二个退出登录按钮。账号数据来自 `ui-sdkwork-iam` 服务的 profile 快照；该分区不持有认证运行时，也没有自己的设置命名空间。

## 目录

- [表面](#surface)
- [数据](#data)
- [退出登录](#sign-out)
- [实现说明](#implementation-notes)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

## 表面

插件注册一个 `settings.section` 贡献及其字典：

- **导航项「个人主页」**（`settings.section`，id `profile`，order `-190`）：设置面板的第二个导航项，位于「通用」正下方；`ui-sdkwork-settings-menu` 为已知 id 绘制导航图标。
- **分区正文**：身份头部（首字母头像、昵称、账号类型徽标、邮箱、前往管理中心）、`个人 / 企业` 两个标签页、账号信息卡片、关联账号卡片，以及带退出说明与按钮的页脚。企业页展示会话所属的组织/租户 ID，未加入企业时展示引导前往管理中心的空状态。
- **未登录状态**：匿名访问者看到登录入口而不是空白页，分区不会是死路。

## 数据

`IamProfileSnapshot`（来自 `ui-sdkwork-iam`）是分区读取的唯一值：昵称、邮箱、用户名、账号 ID、组织/租户 ID、账号类型（`personal` 或 `enterprise`；IAM 登录上下文对个人会话返回 `organizationId: '0'`）、当前环境与 app id、CloudRouter 管理中心地址，以及是否可退出登录。IAM 服务按控制器状态加环境事实缓存该快照，因此 `useProfile` 钩子观察到的是稳定引用，直到某个事实变化。

## 退出登录

页脚按钮调用 `iam.requestSignOut()`，与设置弹层底部退出登录行为使用同一个服务入口。服务弹出确认弹窗；确认后在系统浏览器打开 CloudRouter 托管的退出登录页（`<cloudRouterUrl>/auth/sign-out`，由 `@sdkwork/auth-pc-react` 实现、CloudRouter 应用挂载），并清除本页会话。分区本身不打开浏览器，也不清除令牌。

## 实现说明

- 分区以 `iam` Cordis 服务为前提：未挂载 `ui-sdkwork-iam` 的组合会让该插件保持 pending，没有账号服务就不渲染账号页。
- 本包的 tsc emit 把 sdkwork 认证相关导入解析到 `ui-sdkwork-iam` 的声明门面（`../ui-sdkwork-iam/sdkwork-types/`），不重复维护同一套门面；对 `IamProfileSnapshot` 的类型导入是共享声明，而不是对另一个插件实现的取值依赖。

## 模型体验

无。个人主页是浏览器侧账号界面，既不组装也不发送模型请求。

#### KV 缓存影响

无；本包既不组装也不发送 provider 请求。

## 已知限制与后续工作

- **不支持资料编辑** —— 分区只呈现账号并链接到管理中心；修改昵称、邮箱或密码仍属于托管页面的职责。
- **企业数据仅限会话上下文** —— 组织名称与成员权限需要当前 app SDK 面未暴露的 IAM 组织读取能力；页面对已有 ID 如实展示并指向管理中心。
- **关联账号为静态列表** —— 卡片列出共用该账号的 SDKWork 产品，而不查询关联台账，因为当前没有面向该表面的关联台账。
