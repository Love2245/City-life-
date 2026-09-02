# 喵喵对决 · 背景美工 AI 提示词（v1.37 第 4 项 · 本次只出提示词，不做实现）

> 目标：根据「决斗开始场地」与「时间段」切换对决背景图，让每场对决都有对应的场景氛围。
> 本次仅提供提示词与规格，待接收成品图后再接入（`BattleView.svelte` 的背景层替换计划见文末）。

## 一、规格要求（成品图通用约束）

- 尺寸：1920 × 1080（16:9），与当前战斗界面全屏适配；
- 构图：**中央横向留空**（交战双猫站位区，占画面中央约 60% 宽度），主体场景元素放在上下/两侧，避免遮挡猫咪立绘与血条/意图气泡；
- 透视：平视或轻微俯视，舞台感、场地感强，像游戏对战场地而非纯风景画；
- 光照：明暗对比明显，为前景猫咪立绘（椭圆光晕）留出发光空间；
- 风格：半写实插画 / 卡通风，色彩饱和、质感细腻，与现有紫夜竞技场氛围统一但场地特征鲜明；
- 文件：PNG，无文字，无水印，可无缝铺满。

## 二、场地 × 时间段 → 背景提示词矩阵

每组给出**完整提示词（可直接投喂 AI 绘图）**与**负面提示词**。

### 场地 A：街角 / 巷口（casual 对决、自由锻炼遭遇默认场地）

**白天（6:00-18:00）**
> A sunlit urban alley duel arena, warm morning light, brick walls with peeling posters, a small stray-cat food bowl and cardboard box in the corner, distant city skyline, soft depth of field, the CENTER third of the image is an open empty floor for two fighters, painterly semi-realistic game background art, 16:9.

**黄昏（18:00-20:00）**
> Golden-hour alleyway fighting stage, long warm shadows, an orange sunset glow over rooftops, strings of warm light bulbs strung across the alley, a few drying clothes and potted plants on windowsills, open empty center floor for two cats, painterly semi-realistic game background art, cinematic rim lighting, 16:9.

**夜晚（20:00-6:00）**
> Moonlit back-alley duel arena at night, deep blue shadows, a single flickering streetlamp casting a warm cone of light on the empty center floor, wet asphalt with reflections, faint neon signs in the distance, open empty center for two fighters, painterly semi-realistic game background, high contrast night mood, 16:9.

### 场地 B：公园 / 草坪（自由锻炼遭遇、自然系对手）

**白天**
> A park clearing dueling stage in soft daylight, lush green lawn, cherry blossom petals drifting, a wooden bench and a fountain in the background, gentle god-rays through tree leaves, open empty grassy center floor, painterly semi-realistic game background art, fresh and lively, 16:9.

**黄昏**
> Dusk park fighting ground, warm fading sunlight, fireflies beginning to glow, silhouettes of trees, a small pond reflecting orange sky, open empty lawn center for two fighters, painterly semi-realistic game background art, calm and nostalgic, 16:9.

**夜晚**
> Night park duel arena under a full moon, cool moonlight on the grass, soft glowing fireflies and garden lamps along the path, deep blue-green tones, mist curling low, open empty center floor, painterly semi-realistic game background art, mysterious quiet mood, 16:9.

### 场地 C：游乐场 / 擂台赛（喵喵娱乐赛、锦标赛场地）

**白天**
> A festive carnival fighting stage in daytime, red-and-white striped awnings, strings of bunting flags, a fairground wheel and game booths blurred in the background, bright confetti on the ground, an open empty central stage for two fighters, painterly semi-realistic game background art, cheerful and energetic, 16:9.

**黄昏**
> Carnival championship arena at dusk, stage spotlights just turning on, warm amber light mixed with purple sky, audience silhouettes, strings of lights glowing, open empty center stage for the finalists, painterly semi-realistic game background art, dramatic championship atmosphere, 16:9.

**夜晚**
> Nighttime tournament main stage, dramatic spotlights from above, dark crowd with glowing phone lights in the background, a big champion banner and two spotlit pillars framing the empty center stage, neon-purple and gold palette, painterly semi-realistic game background art, epic final-match mood, 16:9.

### 场地 D：最终对决 · 耄耋之王（Boss 战专用，不分时段）

> A grand celestial throne room as a final boss arena, swirling cosmic nebula sky with a ringed planet, floating stone pillars with golden runes, soft divine light from above shining on an empty central circular platform, regal and awe-inspiring, dark deep-purple and gold palette, painterly semi-realistic game background art, epic final-boss scale, 16:9.

### 通用负面提示词（Negative Prompt，所有图共用）

> text, watermark, signature, people, humans, crowds with clear faces, vehicles, logos, letters, UI, HUD, border frame, centered subject, busy background behind the center, too bright overall, flat lighting, oversaturated noise.

## 三、接入方案备忘（收到成品图后执行）

1. 成品图放入 `src/assets/bg/battle/`，命名 `场地_时段.png`（如 `alley_day.png`、`park_night.png`、`arena_dusk.png`、`boss.png`）；
2. `src/game/core/backgrounds.ts` 增加对决背景解析函数：根据 `state.locationId`（street/park/amusement/…）与 `state.time.hour` 映射到 3 张图之一；
3. `BattleView.svelte` 的 `.combat-bg` 层改为 `<img>` 背景层（保留顶部聚光/暗角渐变叠加保证可读性）；Boss 战固定 `boss.png`；
4. 保持对决层 `.overlay` 不透明底色不变，图片仅作为其上第一层；
5. 抠图瑕疵：随背景图一并优化（见 v1.37 第 6 项）。
