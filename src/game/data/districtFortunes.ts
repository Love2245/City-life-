/** 东月道观原创签文；只改变当次心情，不修改其它事件概率。 */
export interface DistrictFortune {
  id: string;
  name: string;
  weight: number;
  mood: number;
  text: string;
  interpretation: string;
}

export const DISTRICT_FORTUNES: DistrictFortune[] = [
  {
    id: "great_luck", name: "大吉", weight: 8, mood: 5,
    text: "山前晨雾散。\n湖上远帆归。\n手中灯未灭。\n新路待君行。",
    interpretation: "眼前的道路渐渐清楚，过去的努力也开始得到回应。可以把一直准备的事情向前推进一步；好运仍需踏实行动相伴。",
  },
  {
    id: "luck", name: "吉", weight: 17, mood: 3,
    text: "石阶生嫩草。\n风过有清音。\n旧友来相问。\n寻常见暖心。",
    interpretation: "顺利藏在日常的小事里，可能是一句问候，也可能是终于做好的工作。认真对待身边的人与事，今天已有值得珍惜的收获。",
  },
  {
    id: "small_luck", name: "小吉", weight: 20, mood: 1,
    text: "一叶落溪边。\n微光照掌间。\n莫嫌前步小。\n积水亦成湾。",
    interpretation: "事情会有细小的进展，却未必马上显出结果。先做好眼前能够完成的一件事，保持自己的步调，点滴积累也会留下痕迹。",
  },
  {
    id: "neutral", name: "平", weight: 30, mood: 0,
    text: "云停山不动。\n水静月还圆。\n今朝无急事。\n且把旧书翻。",
    interpretation: "今天适合平稳安排生活，不必为了变化而变化。照常吃饭、工作与休息，给尚未想清楚的事情留一点时间。",
  },
  {
    id: "small_misfortune", name: "小凶", weight: 15, mood: -1,
    text: "细雨湿衣角。\n归途慢半程。\n檐下稍停步。\n再行看路灯。",
    interpretation: "一些小麻烦可能打乱原先的安排。把计划留出余地，遇到不顺先停一停；绕一点路，也能够安稳到达。",
  },
  {
    id: "misfortune", name: "凶", weight: 7, mood: -3,
    text: "山风吹乱纸。\n渡口暂收舟。\n莫向深流去。\n回身整旧裘。",
    interpretation: "这支签提醒你先整理已经承担的事情，别在疲惫或冲动时增加新的负担。暂缓一个决定，补足准备，再寻找合适的时机。",
  },
  {
    id: "great_misfortune", name: "大凶", weight: 3, mood: -5,
    text: "暮云遮远岭。\n灯影落空阶。\n此夜宜安坐。\n明朝再启鞋。",
    interpretation: "抽到这支签不代表坏事一定发生。它把目光放在休息与照顾自己：先放下过满的计划，和可信的人说说近况，等心绪平稳再出发。",
  },
];
