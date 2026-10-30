import type {RecordedEffect} from './recordedEffects';
import type {InteractionSoundId} from './interactionSoundRouting';
import {DETAILED_SOUNDS} from './detailedSoundCatalogue';
import fridge_open from "../assets/sfx/日常交互/冰箱开门_426366.mp3?url";
import door_open from "../assets/sfx/日常交互/开门_398750.mp3?url";
import door_close from "../assets/sfx/日常交互/关门_586840.mp3?url";
import mouse from "../assets/sfx/日常交互/鼠标_213004.mp3?url";
import drawer from "../assets/sfx/日常交互/抽屉_541417.mp3?url";
import page from "../assets/sfx/日常交互/翻页_151220.mp3?url";
import switchFile from "../assets/sfx/日常交互/开关_788642.mp3?url";
import elevator from "../assets/sfx/日常交互/电梯提示_588718.mp3?url";
import keyboard from "../assets/sfx/日常交互/键盘_567266.mp3?url";
import pour from "../assets/sfx/日常交互/倒水_740116.mp3?url";
import cook from "../assets/sfx/日常交互/烹饪_871871.mp3?url";
import chop from "../assets/sfx/日常交互/切菜_839155.mp3?url";
import cutlery from "../assets/sfx/日常交互/餐具_450783.mp3?url";
import coins from "../assets/sfx/日常交互/零钱_223342.mp3?url";
import tap from "../assets/sfx/日常交互/用水_451761.mp3?url";
import steps from "../assets/sfx/日常交互/脚步_813622.mp3?url";
import cloth from "../assets/sfx/日常交互/衣料_435296.mp3?url";
import fridge_close from "../assets/sfx/日常交互/冰箱关门_94646.mp3?url";

/** Edited CC0 recordings. Sources, licenses and hashes: docs/interaction-audio-1497-20261027/sound-manifest.json. */
export const INTERACTION_SOUNDS={
  ...DETAILED_SOUNDS,
  fridge_open:{url:fridge_open,gain:1,channel:"facility",cooldownMs:140},
  door_open:{url:door_open,gain:0.9,channel:"facility",cooldownMs:140},
  door_close:{url:door_close,gain:0.75,channel:"facility",cooldownMs:140},
  mouse:{url:mouse,gain:0.65,channel:"ui",cooldownMs:90},
  drawer:{url:drawer,gain:0.9,channel:"facility",cooldownMs:140},
  page:{url:page,gain:0.95,channel:"action",cooldownMs:140},
  switch:{url:switchFile,gain:0.8,channel:"ui",cooldownMs:140},
  elevator:{url:elevator,gain:0.7,channel:"facility",cooldownMs:140},
  keyboard:{url:keyboard,gain:0.8,channel:"action",cooldownMs:140},
  pour:{url:pour,gain:0.8,channel:"action",cooldownMs:140},
  cook:{url:cook,gain:0.65,channel:"action",cooldownMs:140},
  chop:{url:chop,gain:0.75,channel:"ui",cooldownMs:140},
  cutlery:{url:cutlery,gain:0.75,channel:"action",cooldownMs:140},
  coins:{url:coins,gain:0.8,channel:"action",cooldownMs:140},
  tap:{url:tap,gain:0.7,channel:"action",cooldownMs:140},
  steps:{url:steps,gain:0.75,channel:"action",cooldownMs:140},
  cloth:{url:cloth,gain:0.85,channel:"facility",cooldownMs:140},
  fridge_close:{url:fridge_close,gain:0.85,channel:"facility",cooldownMs:140},
} satisfies Record<InteractionSoundId,RecordedEffect>;
