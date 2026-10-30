import museumNeolithicJar from "../../assets/exhibitions/district/museum_neolithic_painted_jar.webp";
import museumBronzeDing from "../../assets/exhibitions/district/museum_bronze_ritual_ding.webp";
import museumHanFigure from "../../assets/exhibitions/district/museum_han_terracotta_figure.webp";
import museumTangMirror from "../../assets/exhibitions/district/museum_tang_bronze_mirror.webp";
import museumSongCeladon from "../../assets/exhibitions/district/museum_song_celadon_vase.webp";
import museumJadeBi from "../../assets/exhibitions/district/museum_jade_bi_disk.webp";
import museumLandscapeScroll from "../../assets/exhibitions/district/museum_landscape_silk_scroll.webp";
import museumStele from "../../assets/exhibitions/district/museum_carved_stele.webp";
import scienceLever from "../../assets/exhibitions/district/science_lever_balance.webp";
import sciencePrism from "../../assets/exhibitions/district/science_prism_spectrum.webp";
import scienceWaterPressure from "../../assets/exhibitions/district/science_water_pressure.webp";
import scienceCircuit from "../../assets/exhibitions/district/science_low_voltage_circuit.webp";
import scienceResonance from "../../assets/exhibitions/district/science_acoustic_resonance.webp";
import scienceSolar from "../../assets/exhibitions/district/science_solar_generator.webp";
import scienceRoboticArm from "../../assets/exhibitions/district/science_robotic_arm.webp";
import scienceOrrery from "../../assets/exhibitions/district/science_orrery.webp";
import artMonaLisa from "../../assets/exhibitions/district/art_01_mona_lisa.webp";
import artStarryNight from "../../assets/exhibitions/district/art_02_starry_night.webp";
import artLastSupper from "../../assets/exhibitions/district/art_03_last_supper.webp";
import artTheScream from "../../assets/exhibitions/district/art_04_the_scream.webp";
import artPearlEarring from "../../assets/exhibitions/district/art_05_pearl_earring.webp";
import artGuernica from "../../assets/exhibitions/district/art_06_guernica.webp";
import artBirthVenus from "../../assets/exhibitions/district/art_07_birth_venus.webp";
import artCreationAdam from "../../assets/exhibitions/district/art_08_creation_adam.webp";
import artNightWatch from "../../assets/exhibitions/district/art_09_night_watch.webp";
import artPersistenceMemory from "../../assets/exhibitions/district/art_10_persistence_memory.webp";
import artTheKiss from "../../assets/exhibitions/district/art_11_the_kiss.webp";
import artSchoolAthens from "../../assets/exhibitions/district/art_12_school_athens.webp";
import artImpressionSunrise from "../../assets/exhibitions/district/art_13_impression_sunrise.webp";
import artSunflowers from "../../assets/exhibitions/district/art_14_sunflowers.webp";
import artLasMeninas from "../../assets/exhibitions/district/art_15_las_meninas.webp";
import artLibertyLeading from "../../assets/exhibitions/district/art_16_liberty_leading.webp";
import artAmericanGothic from "../../assets/exhibitions/district/art_17_american_gothic.webp";
import artLaGrandeJatte from "../../assets/exhibitions/district/art_18_la_grande_jatte.webp";
import artWandererFog from "../../assets/exhibitions/district/art_19_wanderer_fog.webp";
import artHuntersSnow from "../../assets/exhibitions/district/art_20_hunters_snow.webp";
import catComposition from "../../assets/exhibitions/abstract-cats-1498/b01_composition8_roundhead.webp";
import catBoogie from "../../assets/exhibitions/abstract-cats-1498/b02_boogie_mechat.webp";
import catSquare from "../../assets/exhibitions/abstract-cats-1498/b03_black_square_queen.webp";
import catParnassum from "../../assets/exhibitions/abstract-cats-1498/b04_parnassum_necromancer.webp";
import catSunMoon from "../../assets/exhibitions/abstract-cats-1498/b05_sun_moon_lightning.webp";
import catCarnival from "../../assets/exhibitions/abstract-cats-1498/b06_carnival_marshmallow.webp";
import catRhythm from "../../assets/exhibitions/abstract-cats-1498/b07_autumn_rhythm_skeleton.webp";
import catRustBlue from "../../assets/exhibitions/abstract-cats-1498/b08_rust_blue_ghost.webp";
import catChance from "../../assets/exhibitions/abstract-cats-1498/b09_chance_snowman.webp";
import catAdulthood from "../../assets/exhibitions/abstract-cats-1498/b10_adulthood_tiger.webp";

/** 三馆固定展品与文字主题。全部展图使用本地素材；美术馆展签只展示作品名，不列作者。 */
export interface DistrictExhibit {
  id: string;
  title: string;
  caption: string;
  rank?: number;
  svg?: string;
  image?: string;
}

export interface DistrictExhibition {
  id: string;
  locationId: string;
  title: string;
  intro: string;
  monthlyThemes?: { name: string; desc: string }[];
  exhibits: DistrictExhibit[];
}

const photoExhibit = (id: string, title: string, caption: string, image: string): DistrictExhibit => ({ id, title, caption, image });
const rankedArtExhibit = (rank: number, id: string, title: string, caption: string, image: string): DistrictExhibit => ({ rank, id, title, caption, image });

export const EXHIBITIONS: Record<string, DistrictExhibition> = {
  dev_museum: {
    id: "city_memory", locationId: "dev_museum", title: "器物与造物",
    intro: "从彩陶、青铜、陶塑到书画与石刻，八件展项呈现不同材料、器形和工艺。展签聚焦可见细节，不为虚构馆藏编造具体出土地点或真品来源。",
    exhibits: [
      photoExhibit("neolithic_painted_jar", "新石器彩陶罐", "红褐胎体上的彩绘以对称带纹组织器表。展签从陶胎、器形与彩绘工艺展开介绍，不标注未经核实的具体出土地点。", museumNeolithicJar),
      photoExhibit("bronze_ritual_ding", "商周青铜礼器", "鼎形器以耳、腹与足构成稳定轮廓，表面纹饰呈现铸造工艺的层次。本馆说明聚焦器形和装饰，不指向具体墓葬或遗址。", museumBronzeDing),
      photoExhibit("han_terracotta_figure", "汉代陶俑", "陶俑以站立姿态、衣褶与发髻塑造人物形象。展项关注塑形细节与古代陶塑的常见造型传统，不编造墓葬来源。", museumHanFigure),
      photoExhibit("tang_bronze_mirror", "唐代铜镜", "圆形镜体以中心钮和环绕纹饰构成画面。展签引导观察铸造边缘、纹样布局与表面保存状态，不将器物绑定到某处遗址。", museumTangMirror),
      photoExhibit("song_celadon_vase", "宋代青瓷瓶", "青瓷瓶以舒展的颈肩比例和温润釉色为主要看点。说明从胎釉、烧成效果与器形变化介绍陶瓷工艺，不声称具体窑口。", museumSongCeladon),
      photoExhibit("ancient_jade_bi", "古代玉璧", "玉璧以圆形器体和中心孔洞呈现克制的几何比例。展签介绍玉材、打磨痕迹与礼仪器形的观察线索，不附会具体收藏来历。", museumJadeBi),
      photoExhibit("landscape_silk_scroll", "山水绢本立轴", "立轴以水墨层次和留白表现山水远近，装裱、绢地和画心比例也值得观察。此展项为虚构馆藏的类型陈列，不指向特定画家或真迹。", museumLandscapeScroll),
      photoExhibit("stone_stele_fragment", "古代纹饰石刻", "石件表面留有浅浮雕云纹和边饰。展签聚焦石材、刻痕、残损边界与保存方式，不编造文字内容或原立地点。", museumStele),
    ],
  },
  dev_science_museum: {
    id: "everyday_science", locationId: "dev_science_museum", title: "科学展项与模型",
    intro: "展厅以可观察、可操作的设备介绍力学、光学、流体、电路、声学、能源、机器人和天体运动。每件展项都对应实际展馆模型或互动装置。",
    exhibits: [
      photoExhibit("lever_balance", "力学平衡台", "横杆、支点和可移动砝码组成一套平衡展具。游客能比较力臂与载荷位置，直观看到杠杆两侧怎样达到平衡。", scienceLever),
      photoExhibit("prism_spectrum", "棱镜与光谱", "光学台将光源、棱镜和透镜排在同一条光路上。观察棱镜展开的色带经透镜投到屏幕，可以理解色散与成像的关系。", sciencePrism),
      photoExhibit("water_pressure", "水压演示装置", "连通管路、阀门与透明液柱组成水压展台。调节水量并观察各处液面高度，可以对照液柱深度与压力的变化。", scienceWaterPressure),
      photoExhibit("low_voltage_circuit", "低压电路实验台", "电池、导线、开关与灯泡组成安全的低压回路。沿着连接路径检查元件，可以观察闭合电路如何让灯泡发亮。", scienceCircuit),
      photoExhibit("acoustic_resonance", "声学共振展项", "共振展具由金属板、振动源和支架组成，细粒会呈现不同的振动分布。它把声音与结构振动的关系转成可观察的变化。", scienceResonance),
      photoExhibit("solar_power", "太阳能发电模型", "小型光伏板连接风扇，展示光能转成电能并驱动负载的过程。展台也提示光照强弱和遮挡会影响输出。", scienceSolar),
      photoExhibit("programmable_arm", "可编程机械臂", "多关节机械臂把连续动作拆成可控制的轴与末端执行器。模型便于观察机械结构、运动范围与自动化设备的基本组成。", scienceRoboticArm),
      photoExhibit("orbital_model", "天体运行模型", "桌面天体仪用齿轮、圆环与行星模型展示相对位置变化。它用于讲解轨道关系，不按真实天体大小或距离等比例呈现。", scienceOrrery),
    ],
  },
  dev_art_gallery: {
    id: "city_art", locationId: "dev_art_gallery", title: "名画奇想展",
    intro: "二十幅世界名画构图经过重新想象，黄色小人走进肖像、星夜、宴席与山海之间。点击翻页，逐幅浏览这场轻松的艺术巡游。",
    exhibits: [
      rankedArtExhibit(1, "mona_lisa", "《蒙娜丽莎》", "黄色主角以安静的微笑望向观众，身后的河谷和远山落在柔和薄雾中。", artMonaLisa),
      rankedArtExhibit(2, "starry_night", "《星月夜》", "旋转的蓝色星空照亮山丘小镇，黄色主角倚在窗前仰望繁星。", artStarryNight),
      rankedArtExhibit(3, "last_supper", "《最后的晚餐》", "长桌与透视线汇向中央，黄色主角坐在席间，周围伙伴投来各异的目光。", artLastSupper),
      rankedArtExhibit(4, "the_scream", "《呐喊》", "桥上的黄色主角捧脸惊呼，橙红天空与蓝色海湾一同卷入夸张的波纹。", artTheScream),
      rankedArtExhibit(5, "pearl_earring", "《戴珍珠耳环的少女》", "黄色主角回身望向观众，一枚明亮的珍珠耳坠成为暗色背景中的光点。", artPearlEarring),
      rankedArtExhibit(6, "guernica", "《格尔尼卡》", "黑白几何碎片拼成动荡画面，黄色主角提灯站在中央，为众人带来一束光。", artGuernica),
      rankedArtExhibit(7, "birth_venus", "《维纳斯的诞生》", "黄色主角乘贝壳来到海岸，花朵、海风与轻扬的衣袂围出明亮场景。", artBirthVenus),
      rankedArtExhibit(8, "creation_adam", "《创造亚当》", "两只手在天空中相遇，黄色主角伸手触向远方的光。", artCreationAdam),
      rankedArtExhibit(9, "night_watch", "《夜巡》", "一束暖光落在队伍前方，黄色主角与伙伴们从古老大厅中整装出发。", artNightWatch),
      rankedArtExhibit(10, "persistence_memory", "《记忆的永恒》", "海岸边的钟表在静谧梦境中柔软下垂，黄色主角坐在长长的影子之间。", artPersistenceMemory),
      rankedArtExhibit(11, "the_kiss", "《吻》", "黄色主角与同伴相拥，金色几何花纹像织物一样包裹着两人的身影。", artTheKiss),
      rankedArtExhibit(12, "school_athens", "《雅典学院》", "拱顶大厅向远方层层延伸，黄色主角站在台阶中央，与学者们分享卷轴。", artSchoolAthens),
      rankedArtExhibit(13, "impression_sunrise", "《日出·印象》", "薄雾笼罩港口，橘色太阳映在水面，黄色主角乘小船驶向晨光。", artImpressionSunrise),
      rankedArtExhibit(14, "sunflowers", "《向日葵》", "一束金黄向日葵在花瓶中舒展，黄色主角从花朵之间探出笑脸。", artSunflowers),
      rankedArtExhibit(15, "las_meninas", "《宫娥》", "明亮的宫廷房间里，黄色主角站在画面中央，身旁的人物与镜中倒影共同注视前方。", artLasMeninas),
      rankedArtExhibit(16, "liberty_leading", "《自由引导人民》", "烟雾与旗帜间，黄色主角举起三色旗，带领身后的人群向前。", artLibertyLeading),
      rankedArtExhibit(17, "american_gothic", "《美国哥特式》", "一对乡村搭档站在木屋前，黄色主角握着干草叉，严肃的姿势透出一点幽默。", artAmericanGothic),
      rankedArtExhibit(18, "la_grande_jatte", "《大碗岛的星期天下午》", "河岸公园里的人们悠闲散步，黄色主角也加入细密色点铺成的午后景色。", artLaGrandeJatte),
      rankedArtExhibit(19, "wanderer_fog", "《雾海上的漫游者》", "黄色主角立于岩石高处，俯瞰被晨雾淹没的群山与山谷。", artWandererFog),
      rankedArtExhibit(20, "hunters_snow", "《雪中猎人》", "雪地、树林与远处村庄铺展开冬日全景，黄色主角和同伴沿着山坡归来。", artHuntersSnow),
    ],
  },
};

/** Add later shows here; the seven-day rotation is derived from save time, never wall-clock time. */
export const ART_GALLERY_SHOWS: readonly DistrictExhibition[] = [
  EXHIBITIONS.dev_art_gallery,
  {
    id: "abstract_cats", locationId: "dev_art_gallery", title: "抽象猫咪奇想展",
    intro: "十幅抽象艺术改编画作，把喵喵对决里的猫咪藏进圆、色块、线条与拼贴。顺着熟悉的皇冠、披风和尾巴，认出画中的老朋友。",
    exhibits: [
      rankedArtExhibit(1, "cat_composition_viii", "《构成第八号·圆头国王》", "圆头猫的脸成为暖色圆盘，皇冠化作细小金色几何，红披风与斜线、弧线一起奏出轻快节奏。", catComposition),
      rankedArtExhibit(2, "cat_broadway_boogie", "《百老汇爵士乐·机械巡游》", "黄线与红蓝色块组成城市路网，机械猫的装甲嵌入交错街区，发亮的眼睛像夜晚的信号灯。", catBoogie),
      rankedArtExhibit(3, "cat_black_square", "《黑色方块·杀手皇后》", "深黑方块里浮出杀手皇后的轮廓，红色王冠与炸弹的火星让安静画面藏着一点危险。", catSquare),
      rankedArtExhibit(4, "cat_ad_parnassum", "《帕尔纳索斯山·亡灵法师》", "细密色点铺成山形与天空，亡灵法师的紫帽、法杖和幽灵伙伴，隐入层层叠叠的暖色马赛克。", catParnassum),
      rankedArtExhibit(5, "cat_sun_moon", "《日月的同时对比·闪电猫》", "日与月在冷暖圆环间彼此呼应，闪电猫的金眼睛与折线花纹穿过绿色、黄色和蓝色的光。", catSunMoon),
      rankedArtExhibit(6, "cat_harlequin_carnival", "《丑角的狂欢·棉花糖》", "棉花糖猫化成粉红云团，在星星、细线和小梯子之间舒展尾巴，整个房间像一场轻盈的梦。", catCarnival),
      rankedArtExhibit(7, "cat_autumn_rhythm", "《秋韵·蓝焰骨架》", "黑白颜料交织出密集节奏，骷髅猫的骨架藏在线条留出的空隙里，青蓝眼睛和火焰一闪而过。", catRhythm),
      rankedArtExhibit(8, "cat_rust_and_blue", "《锈红与蓝·幽灵》", "锈红与深蓝色域缓缓相接，幽灵猫仿佛从薄薄的颜料中浮现，尾巴又悄悄散成一层冷雾。", catRustBlue),
      rankedArtExhibit(9, "cat_laws_of_chance", "《偶然法则·雪人》", "灰蓝纸片散落在暖白纸面上，雪人猫的身体、胡萝卜鼻子和红围巾也由撕纸拼成，像偶然落下的一场雪。", catChance),
      rankedArtExhibit(10, "cat_adulthood", "《十大画作·成年之虎》", "淡紫底色上生长出花瓣与螺旋，虎猫的橙黑条纹沿着卷曲身体流动，与繁盛的植物形态相互缠绕。", catAdulthood),
    ],
  },
];

export interface ExhibitionRotation {
  label: string;
  week: number;
  daysUntilChange: number;
}

export function getDistrictExhibition(locationId: string, month = 1, day = 0): (DistrictExhibition & { currentTheme?: { name: string; desc: string }; rotation?: ExhibitionRotation }) | undefined {
  const safeDay = Number.isFinite(day) ? Math.max(0, Math.floor(day)) : 0;
  const week = Math.floor(safeDay / 7);
  const showIndex = week % ART_GALLERY_SHOWS.length;
  const exhibition = locationId === "dev_art_gallery" ? ART_GALLERY_SHOWS[showIndex] : EXHIBITIONS[locationId];
  if (!exhibition) return undefined;
  const themes = exhibition.monthlyThemes;
  const safeMonth = Number.isFinite(month) ? Math.max(1, Math.floor(month)) : 1;
  return { ...exhibition, currentTheme: themes?.[(safeMonth - 1) % themes.length],
    ...(locationId === "dev_art_gallery" ? { rotation: { label: String.fromCharCode(65 + showIndex), week, daysUntilChange: 7 - safeDay % 7 } } : {}),
  };
}
