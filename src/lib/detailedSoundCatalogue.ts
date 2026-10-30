import type {RecordedEffect} from './recordedEffects';
import shower from "../assets/sfx/场景细化/淋浴_67162.mp3?url";
import sip from "../assets/sfx/场景细化/饮水_320139.mp3?url";
import bottle_open from "../assets/sfx/场景细化/开瓶_334020.mp3?url";
import glass from "../assets/sfx/场景细化/酒杯_842180.mp3?url";
import car from "../assets/sfx/场景细化/汽车启动_138099.mp3?url";
import bike from "../assets/sfx/场景细化/自行车铃_378911.mp3?url";
import bus from "../assets/sfx/场景细化/公交发车_607820.mp3?url";
import train from "../assets/sfx/场景细化/列车_828151.mp3?url";
import cat_food from "../assets/sfx/场景细化/倒猫粮_498839.mp3?url";
import match from "../assets/sfx/场景细化/点香_256803.mp3?url";
import cat_play from "../assets/sfx/场景细化/猫咪玩耍_轻叫_Kerzoven.mp3?url";
/** Checked CC0 HQ previews; source records: docs/nightlife-audio-transition-1497-20261027/sfx-manifest.json. */
export const DETAILED_SOUNDS={
  shower:{url:shower,gain:0.65,channel:'action',cooldownMs:180},
  sip:{url:sip,gain:0.8,channel:'action',cooldownMs:180},
  bottle_open:{url:bottle_open,gain:0.8,channel:'action',cooldownMs:180},
  glass:{url:glass,gain:0.8,channel:'action',cooldownMs:180},
  car:{url:car,gain:0.65,channel:'action',cooldownMs:180},
  bike:{url:bike,gain:0.8,channel:'action',cooldownMs:180},
  bus:{url:bus,gain:0.65,channel:'action',cooldownMs:180},
  train:{url:train,gain:0.65,channel:'action',cooldownMs:180},
  cat_food:{url:cat_food,gain:0.8,channel:'action',cooldownMs:180},
  match:{url:match,gain:0.8,channel:'action',cooldownMs:180},
  cat_play:{url:cat_play,gain:0.7,channel:'action',cooldownMs:180},
} satisfies Record<string,RecordedEffect>;
