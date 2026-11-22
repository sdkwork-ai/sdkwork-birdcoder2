---
description: "SDKWork 模型价格分组插件：在输入框的模型菜单中增加「模型价格分组」入口与二级面板，通过 CloudRouter app API 列出当前 birdcoder 模型可用的账号分组，并为登录用户固化该模型的分组选择。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-model-price-group

[English](README.md) | 中文

## 摘要

输入框的模型菜单里有「模型」与「推理等级」。针对 BirdCoder 中转提供方，本插件在同一菜单中增加「模型价格分组」：一级行显示当前模型正在使用的账号分组（价格档位），二级面板列出该模型可用的全部分组以及「跟随默认分组」。选择结果通过 SDKWork CloudRouter app API 写入登录用户的账号，重启后仍然生效，并对该账号的所有客户端生效。

只有 `birdcoder` 提供方会渲染该入口：其他提供方的模型没有对应的 CloudRouter 账号分组答案。

## 目录

- [使用本包](#use-this-package)
- [了解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>

## 使用本包

插件以 web-app 的 `ui-sdkwork-model-price-group` 行挂载。选中 `birdcoder` 模型后打开输入框的模型菜单：「模型价格分组」出现在模型与推理等级行之后，值单元格显示当前分组。打开二级面板选择分组，或选择「跟随默认分组」清除该模型的个人规则、继承账号级默认分组。

分组列表来自 CloudRouter app API（`GET /app/v3/api/ai/routing/model_groups?model=…`），当前规则来自 `GET /app/v3/api/ai/routing/model_group_defaults`，选择通过 `PUT /app/v3/api/ai/routing/model_group_defaults` 以 `model` 作用域写入。模型 id 使用 harness 在线上使用的 relay 目录键（`<vendor>/<modelId>`），它同时也是 CloudRouter 的目录键。

<a id="understand-the-implementation"></a>

## 了解实现

- `src/client/index.ts` —— 注册词典、构造 app-api 适配器，并把一级行贡献到 `conversation.input.model.options`（id `model-price-group`）、把面板贡献到 `conversation.input.model.pane`（key `model-price-group`）。两者拿到同一个注入面，因此一级与二级始终一致。
- `src/client/model-price-groups.ts` —— 适配器与其快照存储。它用当前 `env` 网关源与共享 IAM 令牌管理器构造生成的 CloudRouter app 客户端，并行读取分组与该用户的规则，解析列表头部的显式 `model` 规则，并写入单元素列表（或用空列表清除）。读取带代数守卫：切换模型会丢弃上一个结果。
- `src/client/selection.ts` —— 读取会话共享的 `modelSelection` 投影，只对 `birdcoder` 提供方作答。
- `src/client/ModelPriceGroupRow.tsx` —— 菜单一级行：显示已固定的分组，否则显示 app-api 标记为 `selected` 的有效默认分组，再否则显示「默认」。
- `src/client/ModelPriceGroupPane.tsx` —— 选择面板。每一行都是 `menuitemradio`，因此沿用模型菜单的方向键与焦点返回处理；写入失败通过菜单宿主的 toast 报告，只有保存成功才关闭菜单。

CloudRouter 数据库把一个作用域存成有序列表（`ai_user_account_group_route`，`priority` 升序），所以一个模型可以对应多个分组用于故障转移；本插件的单选即该列表头部，清除时只删除 model 作用域的行。

## 构建

```sh
pnpm --filter @deepseek-ai/dsh-client-ui-sdkwork-model-price-group bundle
```

<a id="model-experience"></a>

## 模型体验

无。选择器只通过 CloudRouter app API 读写用户的路由偏好，不注册提示词区段、工具或会话事件，也不参与提供方请求。

#### KV Cache 影响

无。所选账号分组改变的是服务该模型的上游账号池，而不是请求体或提示词前缀。

<a id="known-limitations-and-deferred-work"></a>

## 已知限制与后续工作

- 菜单扩展点把行追加在「模型」与「推理等级」之后，因此「模型价格分组」与其他插件贡献的设置行并列，而不是紧贴「模型」下方。
- 需要已登录的 IAM 会话：app API 是用户级接口，会话缺失或过期时该行会把拒绝原因报告给菜单宿主。
- 只有 `birdcoder` 提供方渲染该入口；经由其他提供方访问的中转模型保持账号级默认，没有菜单内覆盖。
- 选择某个分组会把该模型作用域的有序列表整体替换为这一个分组；在别处配置的故障转移列表只在该模型规则被本选择器写入前保留。
- 模型 id 必须存在于 CloudRouter 目录中。路由不认识的 relay 目录键会让读取以 `model not found` 失败，而不是列出账号下全部分组。
- 本选择器不创建或编辑分组；分组、价格方案与账号池成员关系仍由 CloudRouter 控制台运营维护。
