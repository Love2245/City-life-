# v1.48 新区域住宿背景

本组素材由内置 `image_gen` 生成，按 1672×941 的宽幅画面转为 WebP，房间、帐篷与机位在 day/dusk/night 间保持一致。所有窗外景都柔化并适度遮挡，避免天气变化时出现烈日直射。快捷酒店没有沿用市中心酒店的豪华套间。

生成源目录：`C:\Users\lijia\.codex\generated_images\01a11664-18b5-7623-90ac-d48f7c632a2c`

| visualId | day 源 | dusk 源 | night 源 | Prompt set |
| --- | --- | --- | --- | --- |
| `hotel_boyue_quick` | `exec-b323175d-94fb-4b47-85cb-b9cf1282f1d0.png` | `exec-2ab9d300-4825-40b8-9066-98846778acd3.png` | `exec-21efd2bc-7a4c-4b69-970d-6166dbc61d29.png` | 88 元/晚大学城快捷客房，整洁但朴素；床、简桌、电视和淋浴门；纱帘后的普通校园楼宇。暮色与夜景仅编辑同一房间的时段和灯光。 |
| `hotel_boyu_nightmarket` | `exec-c96744c3-425d-42ff-9ded-837673ac458a.png` | `exec-e847230d-9a91-4803-a398-a740039a1145.png` | `exec-b11ece8d-f24d-44f1-9873-b708de151975.png` | 108 元/晚夜市旁快捷客房，隔音厚帘、普通床与简桌，窗外为遮挡后的楼灯。母图按蓝暮色归入 dusk；day/nocturne 从同一母图只改外窗时段与灯光。 |
| `dev_incubator` | `exec-b00929a7-82aa-40f4-8aea-541b732a3d8b.png` | `exec-b969c957-153b-4a31-ab64-517b4f516b47.png` | `exec-5c7ecf8e-c340-451b-8209-d37d0e7bb8ca.png` | 800 元/月的校园边紧凑单间，单人床、写字桌、迷你厨房、淋浴间；明确是创业者住所，不是孵化器办公大厅。 |
| `boyue_talent_apartment` | `exec-72b2af46-649a-4c7f-b233-1ba6d6b17c65.png` | `exec-d2e38e15-9ae9-4ddf-a9eb-9543dbeba537.png` | `exec-bdee2c9a-6563-405a-869c-71381fbc2cb5.png` | 650 元/月的简洁人才公寓，床、学习桌、小厨房、淋浴空间；干净实用，不做酒店化或高档装修。 |
| `camping_lodging` | `exec-32b63e33-52bd-4029-9b6b-23e233e2df33.png` | `exec-5705c5cc-34a2-4e92-a6c5-c77ca3e4394c.png` | `exec-b87d66de-c883-4d60-8948-3c53545744d7.png` | 30 元/晚的保护区租赁帐篷内景：折叠床、睡袋、营灯、纱网门；淋浴为营地公共设施，不画进帐篷。 |

通用变体提示：保留母图的相机、裁切、家具或帐篷装备的位置，只改变窗外/纱网外的时段色温与已有灯具亮度。day 为柔和漫射白昼，dusk 为中性蓝灰暮色，night 为深蓝夜色并使用适度室内暖光。夜市快捷客房是例外：母图本身是暮色，因此其 day 和 night 分别由暮色母图派生。

编码方式：`ffmpeg` `libwebp`, quality 88；生成 PNG 源保留在用户 ImageGen 目录，项目内仅存最终 WebP。
