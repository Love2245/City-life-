# 都市生活 v1.3 beta2

生活模拟游戏《都市生活》（灵感来自安卓《属性与生活》）桌面端重制版。

## 本版亮点（v1.3 beta2）

- **游戏时长统一**：全部工作小游戏统一 30 秒基准；为无全局计时的工厂流水线 / 餐厅组装 / 调度接待 / 分拣 / 记忆配对补上倒计时；主技能每高 1 级再 -8% 时长（下限 50%）。
- **饮料修复**：同类碳酸饮品合并为「碳酸饮料」并同组互认，配菜/饮料按钮新增点中高亮（根治可乐/雪碧同图标导致的「点了无法满足」）。
- **汉堡分层动画**：配料层下落回弹 + 错位投影，出餐打包飞出。
- **便利店九宫格键盘**：收银小游戏新增屏幕数字键盘，纯触控完成找零。
- **配送玩法**：《街角闪送》配送模板接入 5 个外送岗位（外卖日结/全职 → food、快递 → parcel、网约车/出租车 → rideshare）。
- **网管共享**：兼职网管（internet_night_job）与全职网管共享同一套饮品吧小游戏。
- **平板模式**：设置页游戏模式新增第三档「平板」——16:9 加宽画布、左右栏 60-140px。
- **独立小游戏模式**：设置页解锁后主菜单出现「小游戏」入口，全部工作小游戏 + 手机 4 款按玩法分组直玩，不结算不消耗。
- **小游戏弹窗 UI 优化**：统一 720px 卡片与计分条，触控按钮 ≥44px，5 套皮肤兼容。

## v1.3b2-2 玩法深化

- **餐饮类服务完即下班**：不再倒计时，普通日刷新 4-6 位顾客，小概率（20%）刷新 8-10 位 = 加班日（工资加成 ×1.5）。
- **摆摊独立玩法**（街边摆摊 + 周末集市摆摊）：不计时不限顾客数，按批服务、每批结束询问「继续 / 收摊」；每服务一人按份计钱（多劳多得）、扣体力并经过时间，体力不支或太晚强制收摊；周末集市售价为平日 1.5 倍。
- **菜市场扩品**：新增鸡蛋 / 牛奶，晚上 9 点后全场 7.5 折；农村新增卖肉，全部农产品保持比菜市场便宜。
- **便利店下班福利**：33% 概率免费盲盒（每天限一次）。
- **UI 美化**：主菜单毛玻璃面板与按钮质感、全局卡片/按钮阴影光晕、弹窗上浮动效、滚动条美化。

## 技术栈

- Svelte 5（runes）+ TypeScript + Vite + Vitest（776 用例 / 59 文件）
- 小游戏引擎 12 种：sequence / quiz / whack / rhythm / chess / memory / sort / restaurant / factory / checkout / dispatch / delivery
- 可选 Tauri 2 桌面壳（src-tauri）

## 构建与测试

```bash
# 安装依赖（已随包附带 node_modules，可跳过）
pnpm install

# 全量测试（必须单进程串行，并发会因 vite 缓存锁死锁）
npx vitest run --pool=forks --poolOptions.forks.singleFork

# 类型检查（0 error 为达标线）
npx svelte-check --threshold error

# 标准构建（dist/）
CODEBUDDY_SESSION_ID= CLAUDE_SESSION_ID= npx vite build

# 便携单文件构建（dist-portable/index.html，双击即玩）
CODEBUDDY_SESSION_ID= CLAUDE_SESSION_ID= npx vite build --config vite.portable.config.ts
```

> 注：Windows + WorkBuddy 环境下构建前必须清空 `CODEBUDDY_SESSION_ID` / `CLAUDE_SESSION_ID`，
> 否则 vite 清空输出目录时会被 safe-delete shim 拦截（详见 workbuddy-build-runtime skill）。

## 存档

存档结构与 v1.3 beta1 完全兼容，可直接继承旧存档。

## 目录

- `src/game/core/minigame.ts` — 小游戏类型 / 配置查表 / 技能减时层
- `src/game/data/minigames.json` — 35 份小游戏配置（统一 30s 基准；摆摊独立玩法）
- `src/components/layout/minigames/` — 12 个引擎组件 + 手机 4 款
- `src/components/layout/MiniGameHost.svelte` — 引擎分派中心（正式链路与独立模式共用）
- `src/views/ArcadeView.svelte` — 独立小游戏模式
- `src/views/SettingsView.svelte` — 设置页（平板模式 / 独立小游戏解锁）
