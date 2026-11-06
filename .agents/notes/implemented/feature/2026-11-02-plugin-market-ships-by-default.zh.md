# Agent Note：插件市场默认随应用安装

Status: implemented

[English](2026-11-02-plugin-market-ships-by-default.md) | 中文

## 问题

Markets 页的插件 tab 有一个社区插件市场 chip，而这个 chip 的面貌由一件事决定：插件 store 的插件包列表里有没有 `dshmarket`。出货的 BirdCoder profile 恰好只有 `@deepseek-ai/dsh-base` 与 `@deepseek-ai/dsh-web-app`（`PROFILE_TEMPLATES.web`），这条闭包里没有任何一行挂载市场，因此插件包列表里从来没有它，也没有发布 `market` 控制服务，产品自己的插件表面落在「插件市场还未安装」加一个安装按钮上——产品的目录位置变成了安装提示。

## 决策

`dshmarket` 成为 Web 组合出货的一部分，由该组合自己的 patch 挂载，因此每个组合 `dsh-web-app` 的 profile 无需安装步骤就有市场。桌面组合 patch 在 `dsh-web-app` 之上，依赖与那一行都直接继承。

- `packages/bundle/web-app/package.json` 声明 `"dshmarket": "^1.73.8"`，`pnpm-lock.yaml` 钉住已发布的具体版本。
- `packages/bundle/web-app/cordis.patch.yml` 带一行 `dsh-market`，指向 `dshmarket`——与市场自己 bundle patch 插入的同一 id，因此一个覆盖层 id 同时覆盖两条挂载路径。
- 包自带的 `dsh.bundle.patch` 不进入任何 profile 的插件包列表；这一行是唯一挂载点，与内置技能市场、MCP 连接器的组合方式一致（见[内置技能市场](../architecture/2026-11-01-built-in-skill-market-plugin.zh.md)）。

市场走 npm 依赖而不是像技能市场那样 git 子模块链接，因为它在 `prepack` 阶段才构建 `lib/` 与浏览器半边：gitlink 只会带来源码，而本仓库只运行第三方已发布的构建产物，不构建它们（技能市场子模块提交了自己的 `lib/`，所以那条路走得通）。

从组合里挂载、而不是往每个 profile 里塞一个 `dshmarket` 插件包，是为了让修复覆盖已装应用：`initProfile` 从不重写已初始化的 profile，因此 profile 级默认值只对新 home 生效，还需要一次改写用户数据的迁移。

## 这个挂载是什么

市场把面板发布成 `market` 客户端服务（`ctx.provide('market', …)`，契约版本 1，带 `render`），并由 Host 半边提供 `/dsh-market/*`。插件 tab 以可选依赖消费该服务，把面板就地渲染，于是打头的 chip 就是活的社区目录。页面原有的四个界面仍然成立：profile 覆盖层关掉该行时回到安装入口，浏览器半边尚未加载的构建仍然显示刷新提示。

`ui-sdkwork-markets` 依旧不为市场声明版本、依赖或更新逻辑；两个包之间唯一的契约——服务名 `market`、契约版本 1、`render` 方法——就是页面渲染前检查的东西。

## 后果

出货的 Web 或桌面构建打开插件表面即落在可浏览的社区目录上。市场处于宿主托管状态：它的 `/dsh-market/status` 回答 `selfManaged: false`，因此隐藏自己的更新与移除卡片，fork 的「已安装」列表也不会列出它（profile 没有选中这个插件包），版本由应用的发布节奏掌管——市场发版通过升级 `^1.73.8` 并重新生成锁文件进入应用。想彻底去掉市场的部署在 profile patch 里关闭该行即可，插件 tab 随后回落到安装入口。

这条依赖把 `undici` 与 `js-yaml` 带进每个 Web 安装的运行时闭包。桌面运行时按普通 npm 包物化外部注册表依赖，因此打包应用自带市场，首次启动无需下载。

页面的 `pending` 与 `disabled` 两个界面由插件 store 的插件包列表判定，而默认安装里该列表不再包含市场；它们仍然对「把 `dshmarket` 插件包装进 profile 而不走这一行」的部署成立。

## 验证

`packages/bundle/web-app/tests/built-in-plugin-market.spec.ts` 断言组合出的行及其启用状态、包能从本组合解析且两半边都声明并发货、Host 半边注入 `webServer` 并挂载路由、浏览器半边发布带契约版本 1 与 `render` 方法的 `market` 控制服务，以及两个桌面覆盖层都没有关闭或改指这一行。

真实组合：一个临时 `$DSH_HOME`，其 `web` profile 只列 `@deepseek-ai/dsh-base` 与 `@deepseek-ai/dsh-web-app`，在未安装市场的情况下启动 `dsh web`；`/dsh-market/status` 由 Host 半边回答 `{"version":"1.73.8", …, "selfManaged":false}`，外壳文档从客户端模块名册预加载 `dshmarket/client.js`，浏览器半边因此进入页面加载图。`pnpm exec vitest run packages/bundle/web-app packages/client/ui-sdkwork-markets` 覆盖组合与页面。

## 考虑过的替代方案

**保持按需安装。** chip 依然可被发现，不想要社区目录的部署也不必拉取它，但产品插件表面上的市场 chip 就成了安装提示——正是本笔记要修的缺陷。

**像技能市场那样 git 链接市场。** pin 是可评审的 revision，但该包只发布构建产物，本仓库就得构建一个并不拥有的第三方包。

**在每个 profile 里选中 `dshmarket` 插件包。** 这样市场能自管理——自己的更新卡片可用——但 `initProfile` 从不重写已存在的 profile，已装应用因此拿不到市场，升级时还得写用户数据做迁移。

**只在桌面组合里挂载。** Web 产品渲染同一个插件页、期待同一个目录；只在桌面加行会让 `dsh web` 的市场 chip 仍落在安装提示上。
