# 都市生活 1.4 场景背景包

本目录是 1.4 版本独立的场景背景资源包，运行时由 `SceneBackground.svelte` 优先读取，旧版 `src/assets/bg` 保留不覆盖。

每个场景目录使用相同的三时段文件名：

- `day.webp`：白天
- `dusk.webp`：黄昏
- `night.webp`：夜晚

目录名与 `src/game/data/locations.json` 中的地点 ID 或 `src/game/data/regions.json` 中的区域 ID 一致；`main` 用于一级主地图，`downtown` / `suburb` 用于二级区域总览，其余区域和地点目录用于下一级地图与设施页底图。锁定的重工业设施只提供视觉资源，解锁条件和玩法仍由游戏配置控制。
