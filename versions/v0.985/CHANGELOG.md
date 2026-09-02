# 更新日志 · 都市生活 Urban Life

本文件记录《都市生活》每个版本的更新内容。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/) 风格，版本号遵循语义化版本（SemVer）。

## [v0.94.0] - 2026-08-07

> 长期留存大改：针对实机体验反馈，补齐「成长天花板 / 经济无闭环 / 难度是平的」三大核心问题，并加入成就系统与新手指引。

### ✨ 新增

- **成就系统**：60+ 成就覆盖财富 / 工作 / 属性 / 生存 / 收集 / 隐藏六类；手机新增「🏆 成就」应用，解锁实时弹窗。数据驱动（`achievements.json` + `core/achievements.ts`），解锁记录走独立 `state.achievements` 子对象（规避 `flags` 仅 `number|boolean` 限制）。
- **经济闭环**：
  - 产权买房（`housing` 扩展 `own` 模式 + `buyPrice` 房源，购房后免租）；
  - 购置载具资产（`vehicle` 扩展 `owned`，自有车不受租赁到期限制）；
  - 投资理财（`core/invest.ts` + `invest.json`：存款 / 基金 / 股票，每月按 rng 结算盈亏，可亏损）；
  - 奢侈品消费（`items.json` / `actions.json` 高价非功能品，纯身份型消耗）。
  - 经济状态归入 `state.economy`（通胀指数 / 投资组合 / 奢侈品）。
- **难度递增**（`core/difficulty.ts` + `balance.json`）：物价随天数通胀、岗位入职门槛随天数提高、高难挑战事件按天数解锁；复用并统一原房租涨幅逻辑。
- **新手引导**（`core/tutorial.ts` + `tutorial.json`）：首日引导任务链 + 手机「目标清单」面板 + 关键系统首run 提示。

### 🔧 其他

- 存档版本升至 v12（新增 `achievements` / `seen` / `economy` / `tutorial` 子对象，旧档经 `migrate.ts` 自动迁移）。
- 涉及文件：`game/types.ts`、`game/core/state.ts`、`game/core/migrate.ts`、`version.ts`、`package.json`、以及各新增 `core/*.ts` 与 `data/*.json`。

## [v0.936.0] - 2026-08-06

> 逻辑缺陷修复版：修复多个因「月内日 / 绝对日混用」与计数未清零导致的结局死代码、跨月失效与饥饿死亡螺旋。

### 🐛 修复（7 项真 bug）

#### 1. 「饿死街头」结局死代码（hungryStreak）
- 新增「当日已进食」标记：在 `engine.applyEffects` 饱腹正向变动时置 `flags.ateToday = true`；`time.sleepSettlement` 据此清零 / 累加 `hungryStreak` 并施加健康 / 体力惩罚。
- 涉及：`game/engine.ts`、`game/core/time.ts`。

#### 2. 「熬出个黎明」结局不可达
- 原用 `time.day < 360`，但 `time.day` 是月内日（≤30）永远不成立；改用 `absoluteDay(state.time) >= 360` 判定（活满一年）。
- 涉及：`game/core/endings.ts`、`game/core/membership.ts`（absoluteDay 改为从纪元 0 起算）。

#### 3. 破产判定过严（negativeMoneyStreak）
- 原在多处分散自增、仅房租成功时清零，导致欠钱两三晚即判「破产离场」且赚回钱无法消除计数。
- 改为每晚结算末尾统一计算：`money < 0 ? +1 : 0`，赚钱回正则清零。
- 涉及：`game/core/time.ts`、`game/engine.ts`。

#### 4. 租车 / 事件冷却跨月失效（同根因）
- 租车：到期日 `day + 30` 未进位月份，下月 1 号即误判到期；改为到期日月份进位归一化。
- 事件冷却：`time.day - last` 跨月得负数导致整月不进候选池；改为绝对日差值。
- 涉及：`game/core/vehicle.ts`、`game/core/events.ts`。

#### 5. 睡眠恢复预览与真实公式不一致
- 抽出 `sleepQualityOf(hours)` 单一公式，UI 与结算共用；修正 `SleepModal` 的 `$derived(() => …)` 误用。
- 涉及：`game/core/time.ts`、`components/layout/SleepModal.svelte`。

#### 6. 饥饿死亡螺旋
- 晕倒跳过 12 小时原会扣除饱腹（睡眠 / 小睡均传 false，唯独此处漏了）；改为 `advanceHours(12, false)`。
- 政府住房无灶台导致 3 元泡面不可吃；`eat_noodles_home` 去掉 `requiresFacility: cook`，作为兜底餐。
- 涉及：`game/engine.ts`、`game/data/actions.json`。

## [v0.935.0] - 2026-08-06

> 体验打磨与系统收敛版：修复上班时间冲突、平衡食材数值、新增手机「设置」应用、扩展家人消息、重做开局点数分配。

### 🆕 新增 / 调整

#### 1. 修复工作时间逻辑冲突（P1）
- 工业园区 / 物流中心等上班地点开门时间前移（如物流 8-21 → 5-23、电子厂 8-20 → 6-22），允许玩家提前到岗。
- 新增「提前到岗候场 + 原地等待」机制：开门前 2 小时内可进门口候场；`waitHere` / `waitOptions` 支持原地等待（单次要 ≤ 6h，每满 1h 扣 1 心情）。
- `locationOpenPhase` / `closedReason` 区分「还没开门 / 已打烊」并提示营业时间。
- 涉及：`data/locations.json`、`core/actions.ts`、`components/layout/CityMapView.svelte`、`components/layout/ScenePanel.svelte`、`core/jobs.ts`、`components/layout/JobBoard.svelte`。

#### 2. 食材饱食度数值再平衡（P2）
- 生鲜水果降为零食定位（饱腹 25 → 8）；成品盒饭 30 → 34、餐厅牛排 50 → 58、汉堡 30 → 34，性价比提升。
- 自制饭菜成高价值路径（蔬菜 4 元 → +36 饱腹、肉类 15 元 → +52 饱腹、双拼 19 元 → +72 饱腹）。
- 涉及：`data/items.json`、`data/actions.json`、`core/cooking.ts`。

#### 3. 新增手机「设置」应用（P3）
- 手机桌面新增第 5 个 App「⚙️ 设置」，统一收纳：音效开关、版本号、更新日志、重置存档。
- 新增单一数据源 `src/version.ts`（VERSION / CHANGELOG），SettingsView 与手机设置共用，告别硬编码 `v0.89.0`。
- 顶栏静音按钮移入手机设置，设置不再散落。
- 涉及：`components/PhoneView.svelte`、`views/SettingsView.svelte`、`components/layout/TopBar.svelte`、`lib/save.ts`（新增 `resetAllSaves`）、`src/version.ts`。

#### 4. 扩展家人来电与消息（P4）
- 各家庭新增消息场景池（每条 3 种态度回复：暖心 / 平实 / 冷淡），反馈（心情 / 压力 / 金钱等）各异。
- 打开手机时按概率（每天至多一条）收到家人消息，在「通信 → 家人」中阅读并选择回复。
- 涉及：`core/phone.ts`（FAMILY_MESSAGES / pickFamilyMessage / replyFamilyMessage / tryReceiveFamilyMessage）、`stores/uiStore.svelte.ts`（pendingFamilyMsg）、`components/PhoneView.svelte`。

#### 5. 重做开局点数分配（P5）
- 开局「起步装备」改为**策划清单**：删除水果 / 沙拉等低价值零食、生鲜，保留并新增高价值项（汽车、笔记本、电动车、技能证书等）。
- 各装备**点数不等**：自行车 3 / 驾驶本 4 / 笔记本 4 / 证书 4 / 电动车 5 / 健身月卡 3 / **汽车 10**，更具策略性。
- 涉及：`data/items.json`（startOffer / startCost）、`types.ts`（ItemDef 扩展）、`core/items.ts`（START_ITEMS / startCostOf）、`core/families.ts`（validateNewGameSetup 改用逐项点数）、`views/BackgroundView.svelte`。

### ⚙️ 技术
- 新增 `src/version.ts` 单一数据源；`lib/save.ts` 新增 `resetAllSaves`。
- 新增单元测试覆盖起步装备清单（tests/families.test.ts）。
- 测试全绿，svelte-check 0 错误，单文件构建成功。

### 📌 存档兼容
- 存档版本不变，旧存档可直接读取。

---

## [v0.93.0] - 2026-08-06

> 体验与作息大修版：聚焦「时间不该卡死办事」「作息可管理」「恢复更实在」「夜间也能办事」「通行更合理」「找工作更顺」。

### 🆕 新增 / 调整

#### 1. 移除「时间型疲劳硬阻断」（P1）
- **只要体力 > 0，凌晨也能吃饭、移动、办事**——不再出现「困到不行，必须先睡觉」的硬性拦截。
- 真正的硬阻断仅保留在**体力=0 或饱腹=0** 时（强行活动 → 晕倒，由 `guardSurvival` 处理）。
- 涉及：`core/actions.ts`（`canPerform` 移除时间拦截）、`core/jobs.ts`（`performJob` 移除 `else if (isExhausted)` 分支）。

#### 2. 起床闹钟（P2）
- 睡觉弹窗新增「🔔 起床闹钟」：设定叫醒时刻（0-23），睡眠会被闹钟**提前叫醒**（实际睡眠 = min(计划时长, 到闹钟时刻)）。
- 顶栏常驻显示已设闹钟时刻，便于随时查看。
- 涉及：`core/time.ts`（`alarmCappedHours` / `alarmWakeHour`）、`types.ts`（`alarmHour` 字段，向后兼容不升版本）、`state.ts`、`SleepModal.svelte`、`TopBar.svelte`。

#### 3. 体力恢复制度上调（P3）
- 各住宿档位 `recovery` 全面上调（露宿 0.3→0.45、青旅 0.5→0.6、民宿 0.55→0.65、酒店 0.85→0.95、出租屋 0.65→0.8、公寓 0.75→0.88、政府 0.6→0.7）。
- 小睡恢复比例 0.2→0.3；短睡（<4h）睡眠质量下限保底 0.2，避免「睡一小觉几乎不回体力」。
- 涉及：`data/housing.json`、`core/time.ts`（`nap` / `sleepSettlement`）。

#### 4. 24h 机构延长营业（P4）
- 诊所、快餐厅、洗浴中心改为 **0-24 全天营业**；菜市场延长到 **6-23 点**。
- 涉及：`data/locations.json`。

#### 5. 三级地图通行修正（P5）
- **同二级地图（同大区）内移动：0 耗时**（即刻到达）；**跨二级地图移动：0.5 小时**。
- 涉及：`core/actions.ts`（`travelHours` 倒置：同区=0 / 跨区=0.5；`travelLabel` 增加「即刻到达」）、`_moveToLocation`（同区不拦截打烊投影）。

#### 6. 招聘优化（P6）
- 劳务市场每日岗位 **1~3 → 3~6 个**，并**保底含 1 个低门槛岗**（无技能 / 证书要求），确保总能找到活干。
- 固定岗位新增「✅ 一键应聘」：自动前往岗位地点并立即开工（无证可走实习）。
- 涉及：`core/jobs.ts`（`refreshLaborMarket` 保底 + 数量上调）、`JobBoard.svelte`（一键应聘按钮）。

## [v0.92.0] - 2026-08-06

> 机制与可读性大修版：**七大需求全部落地**，重点解决菜市场/便利店商品逻辑、便利店堂食打包、健身房月卡、生存惩罚体系与全场景字体可读。

### 🆕 新增 / 调整

#### 1. 菜市场与便利店商品调整
- 菜市场**仅售水果 / 蔬菜 / 肉类**，移除三明治、沙拉
- 水果可**当场食用**；蔬菜 / 肉类默认**入背包**，需带回住处使用
- 三明治、沙拉改由**便利店购买**；沙拉额外支持在厨房**自制**
- 涉及：`data/items.json`、`cooking.ts`、`actions.json`（新 handler：`buy_fresh` / `buy_ingredient` / `cook_item`）

#### 2. 便利店堂食 / 打包机制
- 购买餐饮时店员询问「堂食还是打包」：**堂食当场吃完生效，打包才入背包**
- 兜底：不传选项按打包处理（不丢东西）
- 涉及：`DineChoiceModal.svelte`、`actions.ts`（`buy_food` 合并堂食/打包）、`uiStore`（`dine` 模态）

#### 3. 健身房月卡修正
- 未办卡锻炼默认**锁定**；购买月卡（300 元，背包内有效期 30 天）后**解锁**
- 到期**自动失效**并重新锁定；采用「绝对到期日」对账，规避晕倒跳 12h / 住院跳天漏扣
- 老存档只挂 `gym_member` flag 的会籍，启动时自动对账回收
- 涉及：`core/membership.ts`、`actions.ts`（`buy_membership`）、`checkRequirements`

#### 4. 负面状态提醒强化
- 饥饿 / 疲劳等负面效果提醒与视觉更醒目：分级横幅 `SurvivalBanner` + 属性行脉冲 / 抖动
- 涉及：`SurvivalBanner.svelte`、`AttributeSidebar.svelte`、`app.css`

#### 5. 生存指标惩罚体系
- 体力 / 饱腹归零 → 强行活动**晕倒**（饥饿额外扣健康）
- 干净度 < 15 → **无法上班**
- 心情连续 7 天 < 30 → **抑郁症**，无法工作，需去医院心理门诊治愈
- 健康过低 → 生病；健康归零连续 > 3 天 → **猝死**，游戏结束
- 晕倒结算通过回调注入，规避 `fatigue → time → jobs` 循环依赖
- 涉及：`core/survival.ts`、`time.ts` / `jobs.ts` / `endings.ts` 接入

#### 6. 字体颜色可读性（最高优先级）
- 所有 HUD / 场景 / 日志 / 任务栏文字加深色描边阴影，任意背景均可读（延续 v0.91 修复并覆盖新增面板）

#### 7. UI 界面优化与过渡
- 整体布局交互优化；场景切换加入淡入过渡动画（fade + `sceneEnter` 关键帧）
- 涉及：`GameView.svelte`、`ScenePanel.svelte`

### ⚙️ 技术
- 新增纯逻辑模块 `core/survival.ts`、`core/membership.ts`、`core/cooking.ts`
- 结局新增「抑郁」「猝死」两类，**共 9 个结局**（`tests/endings.test.ts` 同步修正）
- 新增单元测试 `tests/v092.test.ts`（28 例，覆盖月卡 / 生鲜烹饪 / 堂食打包 / 生存惩罚）
- **测试 324/324 通过，svelte-check 0 错误，单文件构建成功**

### 📌 存档兼容
- 存档版本 **v10 → v11**：旧档可正常读取并自动迁移（新增会籍 / 抑郁 / 猝死计数等字段）

---

## [v0.91.0] - 2026-08-06

> 稳定性与体验打磨版：**六项修复全部落地**，重点解决可读性、手机融合、体力惩罚三大体验问题。

### 🐛 修复

#### 1. 文字颜色与可读性
- 为场景 / 地图 / HUD 面板 / 日志 / 任务栏全部文字添加**深色描边阴影**（`--text-shadow` 变量随昼夜主题自适应）
- 白天主题阴影加深、背景遮罩微调，夜晚主题深色文字不再融入背景
- 玻璃卡片（`.card-glass`）不透明度提升，避免背景透出导致文字融底
- 涉及：`app.css`、`ScenePanel`、`MainMapView`、`RegionMapView`、`CityMapView`、`AttributeSidebar`、`LogPanel`、`QuestSidebar`

#### 2. 手机与任务栏融合（方案 B）
- **右侧栏整体改造成一部"手机"**：外框 + 状态栏（时间/电量）+ 底部 Dock 导航
- 原任务栏变为手机内的**待办事项（To-Do）App**，与电话、游戏、学习、招聘并列展示在手机桌面
- 待办 App 保留完整功能：倒计时 / 迟到提醒 / 一键开工 / 折叠角标
- 电话 / 游戏 / 学习 App 直接内嵌在手机内操作，招聘 App 打开完整手机弹窗
- 折叠态改为整块 📱 展开按钮（保留 v0.89 修复）
- 涉及：`QuestSidebar.svelte`（整体重写）

#### 3. 健身房月卡权限校验
- 「健身房锻炼」行动新增 `gym_member` 月卡校验：**未办月卡无法锻炼**，行动卡显示锁定提示
- 办月卡（300 元）后才能使用器械区；公园锻炼不受影响
- 涉及：`actions.json`

#### 4. 体力惩罚机制（晕倒系统）
- 体力 **< 20**：执行行动 / 工作 / 开工前弹出提示「😮‍💨 很累了，需要休息一下」
- 体力 **= 0**：发出警告；仍强行进行**锻炼 / 工作 / 打游戏** → 角色**晕倒**
- 晕倒结算（`triggerCollapse`）：
  - 按余额 **20%** 收医药费（至少 30 元）
  - 强制送回家（locationId=home）
  - 恢复**一半体力**，健康 -2 / 心情 -5 / 压力 +5
  - 时间**直接跳过 12 小时**（跨天自动刷新任务栏/劳务市场）
  - 解除疲惫 / 作息混乱状态
- 触发点覆盖：健身房/公园锻炼、网吧游戏（`HIGH_COST_ACTIONS`）、全部工作（`performJob`）、手机打游戏（`playGame`）
- 涉及：`fatigue.ts`（新）、`engine.ts`、`actions.ts`、`jobs.ts`、`phone.ts`

#### 5. 睡觉按钮显示异常
- 修复 `canPerform` 对 `sleep_modal` 行动也做疲劳拦截的问题——**疲惫时睡觉按钮不再错误显示"困到不行了"而被禁用**
- 体力极低时玩家可以正常一键打开睡眠弹窗
- 涉及：`actions.ts`

#### 6. 场景切换过渡动画
- 顶层视图切换（主菜单↔游戏↔结局↔存档↔设置）加 **240ms 淡入过渡**
- 游戏内场景切换（主地图↔区域↔地点）加 **180ms 淡入过渡**（`{#key}` 触发）
- 涉及：`App.svelte`、`ScenePanel.svelte`

### ⚙️ 技术
- 新增纯逻辑模块 `src/game/core/fatigue.ts`（疲劳阈值/判定/守卫）
- 晕倒结算 `triggerCollapse` 实现在 `engine.ts`（规避 fatigue → time → jobs → fatigue 循环依赖）
- 新增单元测试 `tests/fatigue.test.ts`（8 例）：**测试 298/298 通过，svelte-check 0 错误，生产构建成功**

### 📌 存档兼容
- 存档版本不变（v10），旧存档可直接读取；新增逻辑（晕倒/月卡）均为运行时行为

---

## [v0.9.0] - 2026-08-06

> 从「半成品」迈向「正式版」的关键一版：**补齐空壳系统 + 兑现结局系统**。
> 这一版让游戏的成长链路第一次完整闭环——练技能 → 攒影响力 → 创业 → 触发结局。

### 🆕 新增

#### 结局系统
- **8 个结局**（`data/endings.json`），覆盖失败 / 成功 / 隐藏三种结局类型：
  - 💸 **破产离场**：连续 7 天入不敷出（失败）
  - 🕯️ **孤独终老**：连续 14 天心情低落（失败）
  - 🥀 **饿死街头**：连续 5 顿没吃饭（失败）
  - ⚰️ **病入膏肓**：健康归零（失败）
  - 🏆 **白手起家**：完成全部 3 个创业项目（成功）
  - 👑 **财务自由**：存款达到 10 万（成功）
  - 🌟 **声名鹊起**：影响力达到 80（成功）
  - 🌅 **熬出个黎明**：在城市活满 360 天（隐藏）
- **自动判定**：每晚睡眠结算后自动检查触发条件，失败结局优先于成功结局，已触发不重复
- **结局页**：完整展示结局正文 + 存活天数 + 余额（替换原占位页）
- **结局图鉴**：主菜单新增入口，已解锁/未解锁（❓）一目了然，可随时回看

#### 创业项目系统
- **3 个创业项目**（`data/projects.json`），激活此前一直闲置的 `career.projects` 字段：
  - 🎮 **独立游戏开发**：需编程 3 级 + 笔记本电脑 → 完成奖励 +5000 元 / +20 影响力
  - 📱 **手机 App 开发**：需编程 5 级 + 笔记本电脑 → 完成奖励 +8000 元 / +25 影响力
  - 🍢 **摆摊创业**：需厨艺 2 级 → 完成奖励 +4000 元 / +12 影响力
- **进度系统**：行动卡实时显示进度条，每次行动推进进度，完成后自动发放奖励并庆祝
- 创业项目是触发「白手起家」结局的关键路径

#### 技能成长补齐
- 📚 **编程入门**（图书馆，需智力 35）：此前编程技能无任何升级途径
- 🎨 **设计入门**（图书馆，需智力 35）：此前设计技能无任何升级途径
- 🍳 **做饭练手**（住处，需灶台）：此前厨艺技能无任何升级途径
- 至此 8 大技能全部具备成长来源

#### 影响力（fame）产出链
- 🎤 **街头卖艺**（街边，需魅力 25）：+2 影响力 + 20 元打赏
- 此前影响力为零产出、创业线悬空；现在「卖艺攒名 → 创业 → 声名鹊起结局」形成闭环

### 🎨 改进
- 行动卡新增**影响力标签**（🌟 +N）
- 创业项目行动卡新增**实时进度条**，完成态显示 ✅
- 结局页与图鉴采用卡片式布局，新增 `.tag.danger` 样式

### 🐛 修复
- 修复 `career.projects` 字段定义了但从未被任何逻辑使用的问题（死字段复活）
- 修复编程 / 设计 / 厨艺三个技能无法升级的成长断头问题

### ⚙️ 技术
- 新增纯逻辑层模块：`src/game/core/projects.ts`、`src/game/core/endings.ts`（不依赖 DOM/Svelte/Tauri）
- `actions.json` 新增 `work_project` handler 路由
- 结局判定挂载于 `sleepSettlement`，路由跳转由 `App.svelte` 的 `$effect` 统一处理
- 新增单元测试：`tests/projects.test.ts`（11 例）+ `tests/endings.test.ts`（16 例）
- **测试 290/290 通过，svelte-check 0 错误，生产构建成功**

### 📌 存档兼容
- 存档版本不变（v10），旧存档可直接读取，无需迁移

---

## 历史版本摘要

### [v0.895] - 2026-08-05
- 驾校 + 考驾照 + 证书实习期 3 天自动发证
- UI 美化与可读性（统一圆角/阴影/按钮变量、HUD 面板固定深色）
- 任务栏折叠修复、随机事件 6 增 1 修、求职流程优化（5 Bug + 招聘页改版）

### [v0.89] - 2026-08-05
- 洗浴中心三档、驾校地点、证书实习期
- 任务栏折叠修复、随机事件增强

### [v0.86] - 2026-08-04
- 常驻任务栏、定时上班 + 迟到分级罚则、通行时间提示
- 市中心网格布局、洗浴三档

### [v0.85] - 2026-08-04
- 载具月租（电动车/三轮车/汽车）、分区住房、睡觉入口
- 背包系统、住院机制

### [v0.8] - 2026-08-03
- 工作体系（19 类岗位：日结/周结/月结）、移动耗时、睡眠系统
- 开局选择（4 档家庭 + 10 点分配）、Debuff 状态、随机事件 22 个

### [v0.6 - v0.7] - 2026-08-02
- v0.6：SVG 城市地图、手机系统、音效、饥饿、浮动工资、事件反馈
- v0.7：三级地图导航、区域面包屑、火车站/郊区预置（未开放）

### [v0.1 - v0.5] - 2026-07
- 核心循环：住房、家庭、24 小时制、AI 背景 + Debuff
- Tauri 2 + Svelte 5 + Vite + TypeScript 架构搭建

---

## 路线图

- **v0.9 剩余**：随机事件线、主线剧情任务、NPC 社交
- **v1.0**：解锁郊区/火车站、新手引导、发布版（Windows/macOS）
