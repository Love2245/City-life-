# 1.49.8 源码同步说明

本分支用于备份和审查 1.49.8 源码。它只同步经过筛选的文本文件，不能作为完整发布包，也不能据此声称完整构建、全部测试或真机验收通过。

## 同步内容

- 以本地 1.498 项目的 1.49.8 源码为准，同步 Svelte/TypeScript 游戏逻辑、UI、数据、样式、构建脚本、配置和测试。
- 同步 Rust/Tauri 与 Android 的 Gradle、Kotlin、防沉迷集成源码和必要版本元数据。普通 Android 版本码为 `1498002`，Tap 版本码为 `1498012`。
- 保留远端已有的隐私政策、历史文档及旧资源。保留旧资源不表示它们已补齐当前版本的全部依赖。
- 仅移除 7 个在最新源码中已不存在的旧组件、数据模块和测试；没有批量清理旧媒体文件。
- 新增源码子集专用测试配置，CI 只运行类型检查与这组回归测试；默认完整测试配置仍保留。

## 本次未同步

- 未使用的头像像素派生数据 `src/game/data/npcFaceMosaics.json` 随肖像素材排除。
- 所有新增二进制素材，包括图片、音频、模型等。部分文本资源清单、哈希和引用保留，因此仓库内存在指向未随本次同步文件的引用。
- 下列 27 个待确认可再分发许可的 GLB，合计 8,478,976 字节。该清单只对应已核实的具体文件，不扩展到其他模型或全部烘焙图：

- `src/assets/home/v1.49/reference/bed.glb`
- `src/assets/home/v1.49/reference/sofa.glb`
- `src/assets/home/v1.49/reference/kitchen.glb`
- `src/assets/home/v1.49/reference/upper-cabinet.glb`
- `src/assets/home/v1.49/reference/microwave.glb`
- `src/assets/home/v1.49/reference/bath-tub.glb`
- `src/assets/home/v1.49/reference/toilet.glb`
- `src/assets/home/v1.49/reference/washing-machine.glb`
- `src/assets/home/v1.49/reference/curtain-panel.glb`
- `src/assets/home/v1.49/reference/curtain-rail.glb`
- `src/assets/home/v1.49/reference/shoe-cabinet.glb`
- `src/assets/home/v1.49/reference/tissue-box.glb`
- `src/assets/home/v1.49/reference/umbrella-stand.glb`
- `src/assets/home/v1.49/reference/indoor-plant.glb`
- `src/assets/home/v1.49/reference/pouf.glb`
- `src/assets/scenes/cafe/woven-basket.glb`
- `src/assets/scenes/convenience-store/microwave.glb`
- `src/assets/scenes/convenience-store/shopper-basket.glb`
- `src/assets/scenes/exterior/street-lamp.glb`
- `src/assets/scenes/exterior/street-lamp-light.glb`
- `src/assets/scenes/exterior/street-bench.glb`
- `src/assets/scenes/exterior/air-conditioner.glb`
- `src/assets/scenes/exterior/air-conditioner-light.glb`
- `src/assets/scenes/exterior/mailbox.glb`
- `src/assets/scenes/exterior/road-hatch.glb`
- `src/assets/scenes/exterior/bicycle.glb`
- `src/assets/scenes/exterior/bicycle-light.glb`

- 项目外的正式 NPC 立绘库：208 张 PNG，327,038,470 字节。93 张在当前项目资源目录中缺失，72 张同路径图片与正式输入不同，43 张对话图集的现有文件哈希吻合。不能只补缺失图片或优先使用已有同名图来假定内容一致。
- 依赖目录、Gradle/Rust/前端缓存、安装包、构建产物、大型单文件 HTML、签名库、凭据、存档、数据库、日志和历史备份。
- 本地大部分审计文档、截图与原始素材；下载的第三方网页也不随源码发布。

## 可以运行的源码检查

使用 Node.js 22 与 pnpm 10，在仓库根目录执行：

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm exec vitest run --config vitest.source-review.config.ts --configLoader runner --no-cache
```

本次在独立目录复核的结果：Svelte 检查 0 个错误、96 个警告（27 个文件）；源码子集回归 8 个文件、36 项测试通过。回归范围包括手机画质保护、模型加载策略、纹理画布、场景合批、接触阴影和版本元数据。该配置有意不加载外部立绘插件，不代表完整素材验证。

## 完整开发与构建的前提

当前不能承诺 `pnpm dev`、`pnpm test` 或 `pnpm build` 在全新克隆后可用。默认 Vite/Vitest 配置会读取外部立绘库，完整测试还读取若干没有同步的文档夹具，运行场景还需要新增二进制资源。

1. 确认待审核模型的可再分发依据，或另行确定替换范围；私有备份本身也不改变素材许可。
2. 补齐可使用的当前版本资源，保留许可证与署名；将正式立绘的准确输入整理为可携带的依赖，并保留对话图集哈希检查。
3. `vite.npcPortraitLibrary.ts` 当前按项目目录外的 `../../素材库/角色人物立绘` 查找正式输入；本次保留原逻辑，没有静默跳过或替换图片。
4. Android 生成文件中有构建机相关路径，例如 `src-tauri/gen/android/tauri.settings.gradle`；在目标构建机安装相应工具链后重新生成这些路径。签名与 Tap 配置由构建环境提供，不提交凭据。
5. 素材优化缓存由项目脚本生成，Python 依赖记录在 `scripts/requirements-assets.txt`；缓存无需提交。
6. 补齐依赖后再运行完整测试、网页/桌面/Android 构建与必要真机检查。

本分支以草稿 PR 交付，不自动合并默认分支，也不变更现有网站或发布渠道。
