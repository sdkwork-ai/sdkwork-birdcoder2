# BirdCoder 更新日志

本文件只记录**当前版本**——`##` 标题就是本次发布打的 tag，不累积历史版本条目；往期条目随各自版本的提交保留在 git 历史里（`git log -p CHANGELOG.md`）。「上游变更」逐字摘自上游该 release 的官方 Release notes（中文部分，英文版见各 Release 页面）；「BirdCoder 本地修改」记录 fork 在该版本上的自有变更（SDKWork 组件、品牌、打包与部署等），不受上游发布节奏影响。

## 0.2.2-alpha.7（fork 发布 2026-11-04）

本版本打在 `birdcoder-v0.2.2-alpha.6`（`0f94a4dc9a`）之后。这一轮没有上游同步窗口——`8bd073392e`（tag `dsh-v0.2.2-alpha.3`）之后上游没有新的 tag 落地，所以本节只有 BirdCoder 自有修改：左侧栏滚动交接与面板启动器、客户端 inspect 清单与 Host 代次的时序、网关精确路由 404 的直通、变更摘要的空内容表示，以及一条阻塞发布车道的依赖 pin 修复。

### 问题修复

* 左侧栏会话列表在滚动分页的交接处不再丢位置：滚动位置、加载哨兵与列表重排之间改为显式的滚动交接，切到别的页面再回来仍停在原处，窄屏与宽屏共用同一套交接逻辑。
* 面板启动器不会再被「更多」菜单吞掉：当没有可取消固定的菜单、也就没有任何入口能把启动器放回来时，启动器保持直接列出。
* 客户端 inspect 清单改为等 Host 代次就绪后再发布：Host 尚未产出代次时清单先挂起，不再注册到上一个代次，避免重启 Host 后读到过期条目。
* 网关不再把精确路由自己的 404 当成回落信号：路由声明了精确匹配且自身返回 404 时直接透传该响应，只有网关未命中才走回落。
* 变更请求没有登记摘要时，变更摘要视图回答「无内容」而不是抛错；打开变更（present-open）按同一口径处理空摘要。

### 测试与文档

* 左侧栏滚动交接、inspect 清单代次、网关 404 直通与变更摘要空内容各自补齐契约测试；侧栏视口 spec 去掉与滚动交接重复的断言。
* sdkwork 选择器组合的 Host 测试补上 Connection 信任策略，使组合测试与真实装配一致。
* 左侧栏 README（中英双语与配对记录）同步到新的滚动交接行为。

### 依赖与发布

* 阻塞发布的根因是依赖 pin 落后，不是代码缺陷：`scripts/sdkwork-sources.manifest.json` 里 `sdkwork-appbase` 的 pin 停在 `2a44105f`（该提交的 `sdkwork-appbase-pc-react` 不声明 `@sdkwork/appbase-component-core`），而锁文件按已含该依赖的新树生成，于是发布车道克隆出的旧树在 `Install (immutable)` 上报 `ERR_PNPM_OUTDATED_LOCKFILE`。本版本把 36 个 SDKWork 兄弟仓 pin 一次性前进到各自已推送的 `origin/main`（`sdkwork-appbase` → `1fc30502`），两条 pin 记录逐字一致；锁文件与全部 pin 的 652 个 importer 重新对账为零失配，因此锁文件本身无需改动。
* `plugins/dsh-im` 子模块跟到 `v5.10.0`（`c826bfa4`）。
