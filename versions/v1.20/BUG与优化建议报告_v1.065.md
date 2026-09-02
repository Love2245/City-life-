# 《都市生活 v1.065》Bug 汇总、游戏性缺陷与优化建议报告

> 审查范围：`src/game/core/*` 纯逻辑层、`src/game/data/*` 数据层、`src/stores/*` 状态层、`tests/*` 测试层
> 审查方法：源码逐文件静态审查 + 数值推演 + 测试覆盖核对
> 严重度分级：**P0 严重（影响核心循环/必现）** · **P1 重要（功能失效/明显不平衡）** · **P2 次要（体验/可读性/边角）**

---

## 一、严重 Bug（P0）

### P0-1 ｜ 周结/月结正式工每晚发薪，发薪日判定完全失效

**文件**：`src/game/core/career.ts` `paycheck()`（L106-127）+ `src/game/core/time.ts`（L363-365）

**现象**：`paycheck()` 被挂在 `sleepSettlement()` 末尾，**每晚都调用**。但 `paycheck()` 内部**没有任何发薪日判定**——`isPayday()` 函数已定义却从未被调用。结果是：周结/月结正式工**每工作一天当晚就拿到当天工资**，`workedDays` 当晚清零，而非按设计在 day 7/14/21/28（周结）或 day 30（月结）一次性发放累计工资。

**连锁影响**：
1. **满勤 +10% 奖励永久不可达**：`workedDays` 每晚清零，永远只能累到 1，`full = workedDays >= workable`（周结需 6、月结需 20+）恒为 false。`tests/career.test.ts` 的"满勤奖励"用例能过，仅因它连续 `applyJob` 6 次后**不经过 sleepSettlement**直接调 `paycheck`——真实游戏中不可能复现。
2. **现金流语义错误**：正式工本应"垫付劳动力、周期回款"的体验消失，变成日结工。
3. **与 CHANGELOG/注释自相矛盾**：`time.ts` L363 注释明确写"周结 day 7/14/21/28、月结 day 30"，`career.ts` 文件头同样声明，但实现未对齐。

**修复建议**：在 `paycheck()` 开头加发薪日守卫：
```ts
export function paycheck(state: GameState): { ok: boolean; amount: number; bonus: boolean } {
  const c = state.career;
  if (!c.kind || c.jobId === null) return { ok: false, amount: 0, bonus: false };
  if (!isPayday(state)) return { ok: false, amount: 0, bonus: false }; // ← 缺失的守卫
  // ... 其余不变
}
```
并补一条测试：非发薪日调 `paycheck` 应返回 `ok:false` 且不改变 `money`/`workedDays`。

---

### P0-2 ｜ 讨说法线"收下钱"解法未设置贿赂证据，导致主线不可通关

**文件**：`src/game/data/story.ts` `justice_s2`（L357-367）

**现象**：`justice_s2`（被收买）的第三个解法"收下钱，就此罢手"（`ignore`）只给 `money: 30000`，**没有设置 `story_evidence_bribe` flag**。而 `arcGoalMet("seek_justice")` 要求三个证据 flag（witness / ledger / bribe）**全部齐备**才能通关。

一旦玩家选了"收下钱"，`justice_s2` 立即进 `doneCards` 永不重抽，`story_evidence_bribe` 再无任何获取途径 → **seek_justice 主线永久不可达成 → 必然走失败结局**。

**与 CHANGELOG 矛盾**：v1.065 更新日志明确写道"`justice_s2 死局：'收下钱'解法现在也设置 story_evidence_bribe flag`"，但数据层并未实际改动。**声称的修复未落地**。

**修复建议**：二选一，需明确设计意图：
- 若"收下钱"应仍可通关（与 changelog 一致）：给该解法 effects 加 `flags: { story_evidence_bribe: true }`。
- 若"收下钱"本身就是"放弃讨说法"的堕落分支（语义合理）：则在 `resolveStoryCard` 中对该解法直接 `st.finalTriggered = true` 并走失败终局，避免玩家以为还能继续。**推荐后者**（拿钱放弃 = 主线失败），并修正 CHANGELOG 措辞。

---

## 二、重要缺陷（P1）

### P1-1 ｜ "每日目标"系统完全未接入，是死代码

**文件**：`src/game/core/quests.ts` L286-338（`generateDailyGoals` / `markGoalWorked` / `tickDailyGoals`）

**现象**：v1.05 新增的"每日目标"功能（随机 2 条小目标，完成给心情奖励）三个函数**全项目零调用**——`generateDailyGoals` 从未在任何 `sleepSettlement`/UI 入口被触发，`markGoalWorked` 在 `performJob` 里也没调用，`tickDailyGoals` 同样无挂载点。grep 全仓确认：除定义处外无任何引用。

**结果**：玩家永远看不到每日目标，`state.dailyGoals` 永远为空。功能形同虚设。

**修复建议**：在 `sleepSettlement` 跨天处调用 `generateDailyGoals(state)`；在 `performJob` 成功后调 `markGoalWorked(state)`；在 `sleepSettlement` 末尾调 `tickDailyGoals(state, m => applyEffects(state,{mood:m}))`。同时把 `generateDailyGoals` 里的 `Math.random()`（见 P2-2）改为 `state.rng`。

---

### P1-2 ｜ 经济数值与剧情目标严重失配，多条主线近乎不可达成

**数据对比**：

| 主线 | 目标资金 | 期限 | 最高日薪(正式工) | 理论毛收入上限 | 扣除生存成本后净收入(估) |
|---|---|---|---|---|---|
| 还清赌债 | 20,000 | 360 天 | 100 元/天 | ~22,000(220 工作日) | ~8,000–12,000 |
| 奶奶手术费 | **30,000** | **300 天** | 100 元/天 | ~22,000 | **~5,000–9,000** |
| 弟弟学费 | 8,000 | 330 天 | 100 元/天 | ~22,000 | 可达（勉强） |
| 风风光光回去 | 8,000 + 名声30 | 330 天 | 100 元/天 | 可达 | 可达 |

**核心问题**：
- **奶奶手术费线基本不可达**：30000 元 / 300 天 = 100 元/天净收入，但日薪 100 元的文员岗扣除房租(~1000/月)、伙食(~30–50/天)、卫生交通后，净存不足 30 元/天。即使叠加剧情卡 `goal` 贡献（全流程约 5000–8000），缺口仍达 15000+。**玩家必然失败**，挫败感极强。
- **体力经济过紧**：如外卖步梯队日薪 35–55 元、体力 -50，单次上班即清空体力（需 45 门槛→扣 50→归零），被迫频繁睡觉/进食，有效工作日被进一步压缩。
- **创业项目杯水车薪**：独立游戏 +5000、摆摊 +4000 为一次性，且需编程 3/厨艺 2 + 笔记本前置，前期无法触及。

**修复建议**（择一或组合）：
1. **提高工资基数 2–3 倍**：日结 45→120、正式工 75→180 左右，使"打一天工能吃三天饱饭"。
2. **下调奶奶线目标**：30000→18000，或延长期限至 360 天。
3. **增加高收益中期活动**：如计件提成、夜班补贴、技能溢价（编程/厨艺达级后日薪×1.5）。
4. **降低生存成本**：政府房延长至 14 天、基础伙食降价、低价食堂。
5. **剧情卡 goal 贡献翻倍**：让推进剧情本身成为主要资金来源，削弱纯打工 grind。

---

### P1-3 ｜ `triggerCollapse` 额外触发一次 `sleepSettlement`，叠加发薪/月租/结局判定

**文件**：`src/game/engine.ts` `triggerCollapse()`（L164-167）

**现象**：晕倒结算中先调 `sleepSettlement(state, {stayedUp:true, hours:0})` 再 `advanceHours(12)`。`sleepSettlement` 内部会跑 `paycheck`/`checkAutoQuit`/`checkEnding`/`tickStory` 等全套日结。若玩家在白天晕倒（如凌晨打工力竭），相当于**额外插入一次完整的夜间结算**。

**连锁**：与 P0-1 叠加 → 晕倒当天可能多领一次日薪；月租/发薪/结局可能在非睡眠时刻被误触发。

**修复建议**：`triggerCollapse` 的 `sleepSettlement` 应只跑"生存衰减+状态解除"子集，或抽取一个不含发薪/月租/结局的 `lightSettlement`；至少在调用前判定"今日是否已结算过"（加 `state.flags.settledToday` 哨兵）。

---

## 三、次要问题（P2）

### P2-1 ｜ `glory_obstacle_scam` 文案与条件错配（程序员小哥 vs 陈姐）

**文件**：`src/game/data/story.ts` L660

文案："程序员小哥上网查背景，他查出这是传销骗局"，但 `requires: { npc: "npc_chen_jie", npcAffinity: 30 }`。v1.06 changelog 声称修复了 16 处此类错配，**此处漏网**。应改为 `contact: "library_coder"` 或 `npc: "npc_coder"`（与文案一致）。

---

### P2-2 ｜ `generateDailyGoals` 使用 `Math.random()` 破坏可播种 PRNG

**文件**：`src/game/core/quests.ts` L314

`[...GOAL_POOL].sort(() => 0.5 - Math.random())` 用了全局 `Math.random`，而全游戏其余随机均走 `state.rng`（mulberry32，可复现）。这导致每日目标的选择不可复现、破坏种子一致性。（注：因 P1-1 该函数当前未调用，影响暂未显现，但接入前必须修。）

**修复**：改用 `weightedDraw`/`shuffle(state.rng, ...)`。

---

### P2-3 ｜ 洗浴中心 24h 套餐 delta 显示为"+100"，实为"设为 100"

**文件**：`src/game/core/actions.ts` `wash_center` handler（L527-533）

手动 push 的 deltas `{key:"satiety",value:100}` 等会被 UI 当作"+100 饱腹"展示，但代码是 `state.player.attrs.satiety = 100`（赋值非增量）。若玩家原本饱腹 60，显示"+100"实际只涨了 40，产生误导。

**修复**：deltas 应传实际增量 `100 - 原值`，或 UI 对 set 类 delta 用"已回满"文案。

---

### P2-4 ｜ `STORY_ARC_DEADLINE = 330` 常量为死代码

**文件**：`src/game/core/story.ts` L44

定义后全文件未使用（实际用 `arc?.deadlineDays ?? 330`）。建议删除或改为 `DEFAULT_STORY_DEADLINE` 并在 `??` 处引用，避免后续误改全局值。

---

### P2-5 ｜ 存档迁移 v21→v22 的 `nextDrawDay` 默认 0 与 `emptyStoryState()` 的 4 不一致

**文件**：`src/game/core/migrate.ts` L186 vs `src/game/core/story.ts` L61

迁移旧档补 `story` 时 `nextDrawDay: 0`，而新开局 `emptyStoryState()` 用 `4`。若旧档恰好是剧情模式（虽概率低），会在读档当晚立即抽卡。建议迁移时统一用 4，或调用 `emptyStoryState()`。

---

### P2-6 ｜ `endings.ts` `healthMin` 字段语义与命名相反

**文件**：`src/game/core/endings.ts` L54

`if (c.healthMin != null && s.attrs.health > c.healthMin) return false;` —— 字段名 `healthMin` 读作"健康最低值"，实际语义是"健康**低于**此值才触发"（即一个上限阈值）。病亡类结局 `healthMin:0` 表示"健康≤0 触发"。命名误导，易致数据填写错误。建议改名 `healthAtMost` 或 `maxHealthToTrigger`。

---

### P2-7 ｜ 日结岗 `job_security`（保安）设置双休却无 locationId，劳务市场仍会刷出但无法接取

**文件**：`src/game/data/jobs.json` `job_security`

`restDays:["sat","sun"]` + 无 `locationId`（走劳务市场池）。周末劳务市场仍刷新此岗，玩家点接取才提示"今天休息"，体验割裂。建议 `refreshLaborMarket` 按当日休息日过滤候选池，或周末灰显。

---

### P2-8 ｜ `job_delivery` 基础 `effects.money:140` / `log:"赚了140元"` 为死数据

**文件**：`src/game/data/jobs.json` `job_delivery`（L15-24）

该岗有 `incomeTiers`，`mergedJobEffects` 会用 tier 覆盖 `money`/`stamina`/`stress`/`log`，基础 effects 里的 `money:140` 和 `log` 永不显示（仅 `health:-2`、`skills.driving:1` 因未被覆盖而生效）。建议清理基础 money/log，避免数据维护时误判。

---

## 四、游戏性玩法优化建议

### 1. 经济循环：从"纯苦力 grind"转向"技能复利"

**现状**：玩家 90% 时间在重复"打工→睡觉→吃饭→打工"，成长感弱，300 天目标像无底洞。

**建议**：
- **技能溢价曲线**：编程/厨艺/服务每升 1 级，对应岗位日薪 +15%（编程岗额外解锁创业项目）。让"投资自己"有明显回报。
- **阶梯式目标**：剧情目标拆成 5 段里程碑，每段完成给阶段性正反馈（解锁新区域/新岗位/NPC），而非 330 天只看一个数字。
- **被动收入**：创业项目完成后改为"月分红"（独立游戏每月 +800），让后期有睡后收入，缓解纯打工疲劳。

### 2. 剧情卡节奏：减少"被动等待"，增加"主动触发"

**现状**：抽卡每 5–9 天自动来一张，玩家大多时候只能干等。

**建议**：
- **主动探事**：在劳务市场/咖啡馆/公园加"打听消息"行动，主动消耗时间换取提前抽卡或定向障碍卡。
- **卡牌连锁可视化**：在手机人情债页用简单线索图展示"做了 A 可能引出 B"，降低玩家对失约惩罚的焦虑。
- **失约惩罚可选化**：首次失约给"补救机会"（额外一张赎罪卡），而非直接累计，避免一次失误毁全局。

### 3. 生存压力：缓解"体力归零→晕倒→医药费→更穷"死亡螺旋

**现状**：体力门槛与消耗极接近（外卖需 45 扣 50），一旦归零晕倒扣 20% 余额，穷人越穷。

**建议**：
- **晕倒医药费封顶**：按余额 20% 但上限 200 元，或首次免费（已有 `collapsed_once` flag，可做首免）。
- **廉价恢复渠道**：公园长椅免费小睡（恢复 15% 体力，限白天）、便利店临期食品打折区（饱腹 +20 仅 8 元）。
- **预警更强**：体力 <20 时直接禁用高消耗行动（当前只 toast 提示，仍可点），避免误操作晕倒。

### 4. 社交系统：让 NPC 特权更可感知

**现状**：NPC 好感门槛 25–60，但特权（内推免证/赊账/送餐）较隐蔽，玩家不知投资谁。

**建议**：
- **关系面板明示特权**：每个 NPC 卡片直接列出"好感 X→解锁：内推免证书/垫付医药费"，让玩家有目的地社交。
- **常驻增益**：达到 close_friend 后每天自动小增益（陈姐送餐已有，可扩展：赵刚送劳务情报、王磊减法律纠纷概率）。

### 5. 信息可读性：关键决策前置提示

**现状**：迟到罚则、通行耗时、岗位要求散在各处，新手易踩坑。

**建议**：
- **接岗前确认弹窗**：显示"此岗 9:00 开门，迟到 1h 扣 20%，需服务技能 2，预计净收入（扣通行/饭钱）约 X 元"。
- **每日财务简报**：睡觉时日志追加"今日净收支 +85 元（工资 140-饭 30-地铁 2-住宿 23）"，让玩家看清钱去哪了。

### 6. 中后期内容：补齐"扎根之后"的成长线

**现状**：郊区/火车站仍 locked，活过 3 个月后内容趋于重复。

**建议**：
- **解锁郊区**：声望 20 或存款 5000 解锁，提供高薪农场/牧场长期岗 + 低价大房源。
- **职业晋升**：正式工满勤 3 个月可晋升（普工→技工→组长），日薪阶梯上涨，给长期玩家上升通道。
- **周目继承强化**：命运点商店增加"开局 +500 启动金""首月免租"等实用项，降低多周目重复打工痛感。

---

## 五、修复优先级建议

| 优先级 | 项 | 工作量 | 建议版本 |
|---|---|---|---|
| 🔴 立即 | P0-1 发薪日守卫 | 小（加 1 行 + 测试） | v1.066 热修 |
| 🔴 立即 | P0-2 justice_s2 死局 | 小（数据 1 行） | v1.066 热修 |
| 🟠 尽快 | P1-2 经济数值平衡 | 中（调数据 + 推演） | v1.07 |
| 🟠 尽快 | P1-1 每日目标接入 | 小（3 处挂载） | v1.07 |
| 🟡 排期 | P1-3 晕倒结算去重 | 中 | v1.07 |
| 🟢 顺手 | P2-1~P2-8 | 小 | 随版本捎带 |

---

## 附：审查中确认正常的设计（无需改动）

- 存档迁移链 v1→v22 完整，各版本分支齐全；
- `refreshLaborMarket` 保底含 1 个低门槛岗，杜绝"无活可干"硬锁；
- `cardDrawable` 要求非推进卡至少 2 个非无视可行解，主线卡至少 1 个，防死局机制健全；
- 证书实习期 3 天发证、内推免证书逻辑闭环正确；
- 迟到分级罚则（80%/50%/旷工）与 `punchIn` 实现一致；
- 跨夜营业时间判定（`start>end`）正确处理；
- 蹭住（crashTonight）独立档位恢复，已修复"露宿蹭住白吃惩罚"旧 bug。

> 本报告基于 v1.065 源码静态审查。P0 两项已通过测试用例核对确认未被现有 650 个测试覆盖。建议修复后补充对应回归测试。
