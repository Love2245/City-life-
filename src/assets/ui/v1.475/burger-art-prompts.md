# 汉堡备餐样板素材

2026-10-03，使用内置 image_gen 生成。背景和食材图集均为项目内独立素材，交互界面由 Svelte 实时绘制。

- `burger-kitchen-v1.png`：暖色小食堂厨房背景。
- `burger-layers-v1.png`：透明 4 × 2 食材图集。上排依次为下层面包、肉饼、芝士、生菜；下排依次为番茄、培根、煎蛋、上层面包。BurgerStack 通过背景定位读取各格。
- 底部按钮、小吃和饮料继续使用已有独立食材精灵。

## 背景提示词

Use case: stylized-concept. Asset type: production background illustration for a cozy Chinese life-simulation burger preparation minigame. Wide landscape 16:9. A warmly lit small burger restaurant kitchen, amber wood counters, cream ceramic tile, a red and cream striped awning at the very top, small condiment bottles and cooking utensils at the far edges, subtle burger-shop atmosphere. Hand-painted game illustration with clean softly outlined shapes, warm ochre, chestnut wood, muted tomato red and cream palette, light paper texture, inviting afternoon sunlight. Composition: center 80 percent intentionally quiet and low-detail, with a broad empty cream tile wall and wood counter so real interactive order cards and food workbench UI can be overlaid. Decorative objects only near extreme side margins. Straight-on frontal view, no perspective tilt. No people, no characters, no logos, no writing, no typography, no UI panels, no food orders, no buttons. This is only an environment backdrop; the game's actual interactive components will be drawn separately.

## 食材图集提示词

Use case: stylized-concept. Production game sprite sheet, transparent background. Exactly 8 separate burger ingredient sprites arranged in a strict 4 columns by 2 rows equally spaced grid, one sprite centered within each cell. Each sprite fills 80 percent of cell width, all the same physical burger diameter. NO grid lines, NO labels, NO text, NO shadows cast outside the sprites, NO plate. Warm detailed hand-painted game food illustration, clean dark brown outlines, appetizing colors. Crucial view: perfectly straight-on FRONT / SIDE elevation, NOT top-down, NOT isometric, so sprites can be stacked in a game to build a hamburger. Upper row left to right: 1 round flat lower bread bun, golden cut face horizontal and bottom rounded; 2 grilled brown round beef patty, thin front-facing disk; 3 single yellow melted cheese slice, thin draping sheet; 4 broad crinkly green lettuce layer. Lower row left to right: 5 thin red tomato slices arranged as one flat burger-wide layer; 6 two crispy bacon strips laid horizontally as one thin layer; 7 flat sunny-side-up fried egg, horizontal layer with yellow yolk visible; 8 golden sesame upper burger bun, broad rounded dome. Keep every layer horizontally aligned, same width, transparent padding, absolutely no stacking inside cells. All eight sprites distinct, every cell centered at x=12.5,37.5,62.5,87.5 percent, y=25 or75 percent. Sprite sheet landscape 2:1, each cell square.
