# 品牌清单（OEM）

[English](README.md) | 中文

每个应用品牌一份 JSON 文件。品牌是一个已安装应用的完整身份：它拥有的 Harness home、Electron 产品名、URL scheme、桌面命令、更新缓存目录与产物命名。由本仓库构建的两个品牌之所以能并排安装、运行、更新和卸载，正是因为上述值无一共用。

`birdcoder.json` 是出厂品牌。打包脚本与 Electron 外壳默认派生的一切都来自它。

## 文件

| 文件 | 归属 | 用途 |
|---|---|---|
| `brands/<key>.json` | 本仓库 | 一个品牌的构建期来源 |
| `brands/<key>.oem.json` | 部署方 | 可选的 OEM profile，打包为 `resources/oem.json` |
| `resources/brand.json`（打包应用内） | 打包 | 所选清单的运行时副本 |
| `resources/oem.json`（打包应用内） | 打包 | 存在 `<key>.oem.json` 时的运行时副本 |

## 选择品牌

优先级从高到低：

1. `DSH_BRAND_CONFIG=/abs/path/brand.json` —— 显式清单，适用于把品牌文件放在别处的打包通道。
2. `DSH_BRAND=<key>` —— `brands/<key>.json`。
3. `birdcoder` —— 出厂品牌。

打包沿用同一优先级，把所选文件写成 `resources/brand.json`，并在 `<key>.oem.json` 存在时把它复制为 `oem.json`。运行时外壳读取 `resources/brand.json`；源码检出（`pnpm dev:desktop`）则读取 `brands/<key>.json`。

## 字段

| 字段 | 含义 | 示例 |
|---|---|---|
| `key` | 小写品牌键；决定文件名并出现在日志中 | `birdcoder` |
| `displayName` | 直接读取清单的界面所用的产品名 | `BirdCoder` |
| `companyName` | 打包元数据中的厂商名 | `SDKWork` |
| `home.dirName` | 用户主目录下的 Harness home 目录名；带点且小写，避免在大小写不敏感的文件系统上互相冲突 | `.birdcoder` |
| `home.adoptLegacyDshHome` | 打包后的首次启动是否可以接管已存在的 `~/.dsh` | `true` |
| `desktop.appId` | 反向域名标识；发布通道的 `DSH_DESKTOP_APP_ID` 仍然优先 | `com.sdkwork.birdcoder` |
| `desktop.productName` | Electron 产品名；决定 userData、单实例锁与日志目录 | `BirdCoder` |
| `desktop.executableName` | 已安装的可执行文件名与 macOS `MacOS/<name>` | `birdcoder` |
| `desktop.protocol` | 外壳注册的自定义 URL scheme | `birdcoder` |
| `desktop.commandName` | 桌面命令、启动脚本文件名与归属回执前缀 | `birdcoder` |
| `desktop.registryKey` | Windows PATH 归属键与互斥体名 | `BirdCoder` |
| `desktop.updaterCacheDirName` | electron-updater 缓存目录 | `birdcoder-updater` |
| `desktop.artifactPrefix` | `-<version>-<os>-<arch>` 之前的产物前缀 | `BirdCoder` |

`parseBrandManifest` 拒绝畸形取值与上游身份（`~/.dsh`、`DeepSeek Harness`、scheme 与命令 `dsh`、`com.deepseek.harness`）。拼写错误会让构建失败，而不是静默地把一个应用的数据拆到两个 home。

`desktop.protocol` 同时承载 SDKWork IAM 浏览器登录回调：更换该 scheme 的 OEM 品牌必须在其 OEM profile 中把 `sdkwork.iamRedirectUri` 设为 `<scheme>://auth/callback`（见[OEM profile](../packages/host/sdkwork-oem/README.zh.md)），因为打包外壳只能接收操作系统已登记 scheme 的 URL。

## Harness home

启动器在任何插件挂载之前解析 home，并把它导出为 `DSH_HOME`——所有使用方本就读取该变量：

1. 显式 `DSH_HOME` —— 测试、CI、便携安装。
2. `~/<home.dirName>` —— 品牌自己的 home。
3. 旧 `~/.dsh`，仅当品牌设置 `home.adoptLegacyDshHome` 且仅在打包启动时：
   - 首次启动把 `~/.dsh` 重命名为品牌 home（同盘移动，会话、凭据、profile 与工作区随之迁移）；
   - 重命名被拒时——旧实例可能仍占用文件——改为创建目录联接；
   - 两者都失败时本次启动继续使用 `~/.dsh` 并报告，应用仍能启动且数据不丢失。

未设置 `adoptLegacyDshHome` 的品牌永不读取 `~/.dsh`：导入其他产品的凭据与会话，比从空目录开始更糟。源码启动从不重命名；品牌 home 存在就用它，否则继续使用 `~/.dsh`。

随包提供的 `resources/oem.json` 只有在 home 中没有自己的 `oem.json` 时才成为默认 `DSH_OEM_CONFIG`，因此部署方可以只读地提供端点，用户仍可在 `~/.<brand>/oem.json` 中覆盖。

## 新增品牌

1. 把 `brands/birdcoder.json` 复制为 `brands/<key>.json`，修改 `key`、`displayName`、`companyName`、`home.dirName` 与每个 `desktop` 值。除非新品牌要替代既有的 `~/.dsh` 安装，`home.adoptLegacyDshHome` 保持 false。
2. 替换该品牌的构建期位图：`build/icon.{ico,icns,png}`、`resources/icon{,-windows,-macos}.png`、安装器品牌图（`pnpm --dir apps/desktop run generate-icons` 与 `generate-installer-brand` 重新生成出厂那一套），以及欢迎页标识。运行时从不替换图片。
3. 用 `DSH_BRAND=<key>`（以及该通道的 `DSH_DESKTOP_APP_ID`、`DSH_DESKTOP_UNSIGNED`、签名变量）通过 `package:*` 脚本构建。
4. 校验：`pnpm exec vitest run apps/desktop/tests/brand-manifest.spec.ts apps/desktop/tests/brand-home.spec.ts apps/desktop/tests/desktop-application-identity.spec.ts`，然后并排安装两个品牌，确认两个 home（`~/.birdcoder`、`~/.<key>`）、两个 userData 目录、两个 URL scheme 与两个命令。

## 尚未按品牌配置

- 安装器文案与原生窗口字符串来自 `apps/desktop/scripts/locale*` 与 NSIS include；在 OEM 构建像替换位图那样替换它们之前，这些文案沿用出厂品牌。
- 图标与产物美术由 BirdCoder 的规范位图生成。
- `desktop.executableName` 决定已安装的二进制名；OEM 构建必须提供同名二进制，electron-builder 由同一字段派生它。
