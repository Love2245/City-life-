<script lang="ts">
  import {duelLobby} from "../../stores/catDuelStore.svelte";
  import {showCityTip} from "../../lib/cityTips";
  import {sceneLoading,beginSceneLoading,type LoadingHandle} from '../../stores/sceneLoading.svelte';
  import {beginTravelLoading} from '../../stores/sceneLoadingRoute.svelte';
  import {sceneLoadingTarget,loadingRegionOf} from '../../lib/sceneLoadingTarget';
  import {transitionRegion,cancelRegionTransition} from '../../stores/regionTransition.svelte';
  import {nativeRegionTransitionActive} from '../../lib/regionTransition';
  import { onDestroy,onMount,untrack } from "svelte";
  import { fade, fly } from "svelte/transition";
  import { motionDurationMs, motionEasing } from "../../lib/motion";
  import { gameState,musicSession } from "../../stores/gameStore.svelte";
  import {
    visibleActionsAtLocation,
    getLocation,
    canPerform,
    moveTo,
    performAction,
    isLocationOpen,
    locationAvailabilityAtArrival,
    travelHours,
    travelText,
    travelToRegion,
    locationOpenPhase,
    closedReason,
    waitHere,
    waitOptions,
    WAIT_MAX_HOURS,
    actionDurationHours,
    performShoppingCart,
    purchasePriceOf,
    type ActionDef,
    type PerformOptions,
    actionTagsOf,
    effectsOf,
    isLocationUnlocked,
    isLocationVisible,
    isNavigationTargetVisible,
  } from "../../game/core/actions";
  import { getItem } from "../../game/core/items";
  import DistrictServicesPanel from "./DistrictServicesPanel.svelte";
  import CommercialServicesPanel from "./CommercialServicesPanel.svelte";
  import ServiceWindows from './ServiceWindows.svelte';
  import CompanyInterior from './CompanyInterior.svelte';
  import HomeDepartureMenu from './HomeDepartureMenu.svelte';
  import { commuteToCompany } from '../../game/core/companyCommute';
  import { cityHotelGuest } from '../../game/core/cityHotels';
  import { companyOfficeHere } from '../../game/core/companyOverview';
  const companyOffice = $derived(companyOfficeHere(gameState));
  import StreetBargain from './StreetBargain.svelte';
  import DistrictLeisurePanel from "./DistrictLeisurePanel.svelte";
  import FishingPanel from "./FishingPanel.svelte";
  import NpcTaskCounter from './NpcTaskCounter.svelte';
  import CafeInterior from "./CafeInterior.svelte";
  import StoreInterior from "./StoreInterior.svelte";
  import {isConvenienceStore} from '../../lib/convenienceStore/facilities';
  import {cafeSceneState} from '../../lib/cafeScene';
  import type {CafeWorkOption} from '../../lib/cafeRoom/facilities';
  import {isFacilityProduct,productCategory} from '../../game/core/facilityShopping';
  import { currentHomeSceneId } from "../../game/core/homeInterior";
  import { districtAtmosphere, isDistrictVisual } from "../../lib/districtAtmosphere";
  import { currentSeason, currentWeather } from "../../game/core/weather";
  import { locationLockReason } from "../../game/core/actions";
  import { isLibraryLocation, borrowLibraryBook, borrowedLibraryBook, returnLibraryBook } from "../../game/core/library";
  import { canInstallFridge, cookingCategoryOf, type FridgeTier } from "../../game/core/fridge";
  import { availableCatsOf, activePetOf, TRAIN_LABEL, getCatItem, CAT_FOOD_SIZE } from "../../game/core/catCare";
  import { getAccessoryDef } from "../../game/core/catAccessory";
  import { getCatDef } from "../../game/core/cat";
    import { freeTrainCat, } from "../../game/core/catBattle"; // v1.34 休闲对决
  import { formatMoney, signed } from "../../lib/format";
  import { formatDuration } from "../../game/core/quests";
  import { DISTRICT_ALCOHOL_BLACKOUT_HOURS } from "../../game/core/districtServices";
  import { currentRegion, homeResidenceName, mapResidenceName } from "../../game/core/housing";
  import { isResidenceLocation, residenceLocationId, isResidenceBuildingVisible, permanentResidence, housingAtLocation } from "../../game/core/residence";
  import { periodLabel, periodOfHour, themeOfHour } from "../../game/core/time";
  import { getMaxStamina } from "../../game/core/stats";
  import { resignationSalaryPreview } from "../../game/core/career";
  import { performJob, localJobsOf, getJobDef, previewWork, workStatusReason, nowWorkMinute } from "../../game/core/jobs";
  import { getWorkShift } from "../../game/core/career";
  import { getMiniGameConfigFor } from "../../game/core/minigame";
  import { FATIGUE_WARN_THRESHOLD } from "../../game/core/fatigue";
  import { uiState, setSceneMode, showToast, showResult, presentJobResult, openNpcTalk, openModal } from "../../stores/uiStore.svelte";
  import { isMobileLayout } from "../../stores/uiStore.svelte";
  import { rollEvent } from "../../game/core/events";
  import { playSound,playInteractionSound } from "../../lib/audio";
  import { tarotCard, consumePendingTarot } from "../../game/core/tarot";
  import JobBoard from "./JobBoard.svelte";
  import CityMapView from "./CityMapView.svelte";
  import RegionMapView from "./RegionMapView.svelte";
  import PortraitStack from "./PortraitStack.svelte";
  import {
    getRegion,
    locationsOfRegion,
    enterRegion,
    goToMap,
    topRegionOf,
  } from "../../game/core/regions";
  import {
    projectProgress,
    isProjectDone,
    isStallProject,
    stallIngredientCheck,
    buyStallPrepKit,
    STALL_PREP_KIT_COST,
    hasLaptop,
    startNetbarSession, // v1.43 网吧上机
  } from "../../game/core/projects";
  import { npcFormalTopics, presentNpcs } from "../../game/core/npcTalk";
  import { availableNpcIntroduction } from '../../game/data/npcSharedIntroductions';
  import { npcWeatherOutfitForConditions } from "../../game/core/npcOutfits";
  import { npcPortraitForContext } from "../../game/core/npcPortraits";
  import type { Effects } from "../../game/engine";
  import {
    actionTextureUrl,
    visualKeyForAction,
    visualKeyForGroup,
    type ActionVisualKey,
  } from "../../lib/sceneVisuals";
  import { currentSceneBackgroundUrl } from "../../lib/housingVisuals";
  import { trainingProgressLabel } from "../../game/core/training";

  /** v0.97 家庭操作分组入口（做菜 → 烹饪页）；开发/设计已整合进笔记本工作台（v1.3） */
  const ACTION_GROUPS = [
    { id: "cook", icon: "🍳", name: "烹饪", desc: "下厨做点吃的（需灶台）" },
    /** v1.20 图书馆读书分组 */
    { id: "read", icon: "📚", name: "读书", desc: "阅读馆藏，或一次借一本回家慢慢看" },
    /** v1.32 猫咪交互分组（家里） */
    { id: "cat", icon: "🐱", name: "猫咪", desc: "照顾 / 携带你的猫咪" },
    /** v1.33 公园猫咪户外训练分组（需携带猫咪） */
    { id: "cat_train", icon: "🏋️", name: "猫咪训练", desc: "带猫咪到户外训练四维属性（需携带）" },
    /** v1.38 宠物用品店二级菜单（食品 / 玩具 / 寝具 / 训练 / 特殊 / 饰品 / 领养） */
    { id: "pet_food", icon: "🍖", name: "食品", desc: "各等级猫粮" },
    { id: "pet_toy", icon: "🧶", name: "玩具", desc: "陪玩用的玩具" },
    { id: "pet_bed", icon: "🛏️", name: "寝具", desc: "猫窝床垫" },
    { id: "pet_train", icon: "💪", name: "训练用品", desc: "训练辅助道具" },
    { id: "pet_special", icon: "🧪", name: "特殊道具", desc: "药水 / 净化剂 / 复活石" },
    { id: "pet_equipment", icon: "🤖", name: "自动设备", desc: "自动喂食猫咪的设备" },
    { id: "pet_acc", icon: "💎", name: "饰品", desc: "佩戴获得对决加成" },
    { id: "pet_adopt", icon: "🐾", name: "领养", desc: "带一只猫咪回家" },
    /** v1.38 宠物医院二级菜单（治疗 / 训练 / 特殊） */
    { id: "hos_treat", icon: "💉", name: "治疗", desc: "治疗伤势与疾病" },
    { id: "hos_train", icon: "🏋️", name: "专项训练", desc: "专注训练 / 删卡" },
    { id: "hos_special", icon: "🧪", name: "特殊道具", desc: "治疗用药水" },
    /** v1.4 花鸟市场：小宠物简易照料 */
    { id: "market_pet", icon: "🐦", name: "小宠物", desc: "购买、喂食、安抚和体检" },
    /** v1.4 小吃街：摆摊小游戏 */
    { id: "market_stall", icon: "🍢", name: "小吃街摆摊", desc: "复用摆摊小游戏，按顾客数获得收益" },
    /** v1.4 花鸟市场/小吃街商店 */
    { id: "market_shop", icon: "🛍️", name: "商店", desc: "购买绿植和街头小吃" },
  ];
  /**
   * v1.42 采购二级菜单：把市场/农场/便利店的同类商品收进一个入口，
   * 避免地点页面被十几个「买某某」按钮挤满。保留旧 action id，实际
   * 结算逻辑无需改变；这里只负责按食材类别组织显示。
   */
  type PurchaseGroupDef = {
    id: string;
    icon: string;
    name: string;
    desc: string;
    categories: readonly string[];
    locations: readonly string[];
  };
  const PURCHASE_GROUPS: PurchaseGroupDef[] = [
    { id: "purchase_vegetables", icon: "🥬", name: "买蔬菜", desc: "番茄、卷心菜、土豆等新鲜蔬菜", categories: ["vegetable", "tomato", "cabbage", "potato", "carrot", "onion", "mushroom"], locations: ["market", "farm"] },
    { id: "purchase_meat", icon: "🥩", name: "买肉", desc: "猪肉、鸡肉、牛肉和农家肉", categories: ["meat", "pork", "chicken", "beef"], locations: ["market", "farm"] },
    { id: "purchase_fruit", icon: "🍎", name: "买水果", desc: "当季水果，解馋补充维生素", categories: ["fruit"], locations: ["market"] },
    { id: "purchase_egg", icon: "🥚", name: "买鸡蛋", desc: "普通鸡蛋与农场土鸡蛋", categories: ["egg"], locations: ["market", "farm"] },
    { id: "purchase_milk", icon: "🥛", name: "买牛奶", desc: "鲜牛奶与牧场牛奶", categories: ["milk"], locations: ["market", "pasture"] },
    { id: "purchase_rice", icon: "🍚", name: "买大米", desc: "农家大米，焖饭煮粥都合适", categories: ["rice"], locations: ["farm"] },
    { id: "purchase_seasoning", icon: "🧂", name: "买调料", desc: "盐、糖、酱油、辣椒粉和沙拉酱", categories: ["seasoning"], locations: ["convenience_store"] },
  ];
  type FurnitureGroupDef = { id: string; icon: string; name: string; desc: string; actionIds: readonly string[] };
  const FURNITURE_GROUPS: FurnitureGroupDef[] = [
    { id: "furniture_lighting", icon: "💡", name: "灯光与装饰", desc: "暖光灯、绿植盆栽，让住处更有生活气息", actionIds: ["buy_lamp", "buy_plant"] },
    { id: "furniture_living", icon: "🛋️", name: "家居家具", desc: "沙发与床具，改善休息和心情", actionIds: ["buy_sofa", "buy_bed_basic", "buy_bed_standard", "buy_bed_premium"] },
    { id: "furniture_kitchen", icon: "🍳", name: "厨具与冰箱", desc: "厨具套装、专业厨具和冰箱家电", actionIds: ["buy_kitchen_set", "buy_cook_set_mid", "buy_cook_set_high", "buy_fridge_small", "buy_fridge_medium", "buy_fridge_large"] },
    { id: "furniture_fitness", icon: "🏋️", name: "健身设备", desc: "家用器材与升级设备，随时保持状态", actionIds: ["buy_gym_equipment", "buy_gym_mid", "buy_gym_high"] },
    { id: "furniture_stall", icon: "🛒", name: "摆摊工具", desc: "折叠小车，解锁街边和集市摆摊", actionIds: ["buy_stall_cart"] },
    { id: "furniture_wallpaper", icon: "▧", name: "墙纸", desc: "买下喜欢的花色，回家更换墙面", actionIds: ["buy_home_wall_ivory", "buy_home_wall_sage", "buy_home_wall_blue", "buy_home_wall_linen"] },
    { id: "furniture_flooring", icon: "▤", name: "地垫与地板贴", desc: "起居地面的铺装样式，买过后可以反复更换", actionIds: ["buy_home_floor_oak", "buy_home_floor_walnut", "buy_home_floor_stone", "buy_home_floor_woven"] },
  ];
  let openGroup = $state<string | null>(null);
  let selectedPurchaseIds = $state<string[]>([]);
  const loanedLibraryBook = $derived(borrowedLibraryBook(gameState) ?? null);
  const currentNpcWeatherOutfit = $derived(
    npcWeatherOutfitForConditions(currentSeason(gameState), currentWeather(gameState)),
  );
  type FlowerFacility = "pet_store" | "pet_hospital";
  /** v1.4：花鸟市场内的宠物用品店/宠物医院，不再把猫咪行动混在市场主页面。 */
  let flowerFacility = $state<FlowerFacility | null>(null);
  const visibleSceneActions = $derived.by(() => {
    if (gameState.locationId === "flower_market") {
      const source = flowerFacility ?? "flower_market";
      // actionsAtLocation("flower_market") 仍保留旧猫咪 action 的兼容索引；UI 这里按内部设施精确筛选。
      return visibleActionsAtLocation(gameState, source).filter((a) => a.locationId === source);
    }
    return visibleActionsAtLocation(gameState, gameState.locationId).filter(a => a.handler !== "district_singer"&&
      (!['housing_agency','car_rental','municipal_hall','hotel','hotel_mooncourt'].includes(gameState.locationId)||isResidenceLocation(gameState)));
  });
  function purchaseCategoryOf(action: ActionDef): string | undefined {
    if (action.itemId === "fruit") return "fruit";
    return action.itemId ? cookingCategoryOf(action.itemId) : undefined;
  }
  const retailProducts=$derived(visibleSceneActions.filter(a=>a.locationId===gameState.locationId&&isFacilityProduct(a)));
  const groupedRetailIds=$derived(new Set(retailProducts.length>=2?retailProducts.map(a=>a.id):[]));
  const retailCategories=$derived([...new Set(retailProducts.map(productCategory))]);
  function isPurchaseAction(action: ActionDef): boolean {
    return (action.handler === "buy_item" || action.handler === "buy_ingredient" || action.handler === "buy_fresh")
      && !!purchaseCategoryOf(action);
  }
  const purchaseGroups = $derived.by(() => PURCHASE_GROUPS.map((group) => ({
    ...group,
    actions: visibleSceneActions.filter((action) => {
      if(groupedRetailIds.has(action.id))return false;
      if (!isPurchaseAction(action)) return false;
      const category = purchaseCategoryOf(action);
      return !!category && group.categories.includes(category)
        && group.locations.includes(action.locationId);
    }),
  })).filter((group) => group.actions.length > 0));
  const groupedPurchaseIds = $derived(new Set(purchaseGroups.flatMap((group) => group.actions.map((action) => action.id))));
  const openPurchaseGroup = $derived(purchaseGroups.find((group) => group.id === openGroup));
  const furnitureGroups = $derived.by(() => gameState.locationId === "furniture_store"
    ? FURNITURE_GROUPS.map((group) => ({ ...group, actions: visibleSceneActions.filter((a) => group.actionIds.includes(a.id)&&!groupedRetailIds.has(a.id)) })).filter(group=>group.actions.length>0)
    : []);
  const groupedFurnitureIds = $derived(new Set(furnitureGroups.flatMap((group) => group.actions.map((action) => action.id))));
  const openFurnitureGroup = $derived(furnitureGroups.find((group) => group.id === openGroup));
  /**
   * 设施较少的分组直接平铺，避免只有一两项时还要多点一层。
   * Cooking uses the workbench; legacy direct-dish actions never appear here.
   */
  function groupItems(groupId: string): ActionDef[] {
    const items = visibleSceneActions.filter((a) => a.group === groupId&&!groupedRetailIds.has(a.id));
    return groupId === "cook" ? items.filter(a=>a.id==='eat_simple_meal_home') : items;
  }
  /** 手游室内场景默认收起等待操作，避免等待条悬浮遮挡核心行动卡片。 */
  let mobileWaitOpen = $state(false);
  /** v1.39 问题5：切换地点时收起已展开的分组，避免「猫咪」分组内容残留到禁止入内的场所 */
  $effect(() => {
    gameState.locationId;
    openGroup = null;
    selectedPurchaseIds = [];
    mobileWaitOpen = false;
    if (gameState.locationId !== "flower_market") flowerFacility = null;
  });

  /** v1.32 当前携带的猫咪（家里猫咪分组状态展示） */
  const activeCat = $derived(activePetOf(gameState));
  const availableCats = $derived(availableCatsOf(gameState));

  /**
   * 收益标签 / 行动标签统一走 core 的 actionTagsOf。
   * v1.33-hotfix：原先在此直接读 action.effects.money，遇到无 effects 的行动
   * （如游乐场赛场入口）会抛 TypeError，导致整个场景面板渲染中断——
   * 表现为「背景切到游乐场，但地点内容一片空白，像进不去」。已下沉到 core 并做空值兜底。
   */
  const actionTags = (a: ActionDef) => actionTagsOf(a, gameState).filter(tag => tag.cls === "cost" || tag.text.includes("💰"));

  /** v1.38 P8：购买类行动显示价格标签（用品店/饰品店与其他设施一致） */
  function priceForAction(a: ActionDef): number | undefined {
    if (isPurchaseAction(a)) return purchasePriceOf(gameState, a);
    if (a.handler === "buy_cat_item" && a.catItemId) return getCatItem(a.catItemId)?.price;
    if (a.handler === "buy_accessory" && a.accessoryId) return getAccessoryDef(a.accessoryId)?.price;
    const item = a.itemId ? getItem(a.itemId) : undefined;
    if (item?.fridgeTier) {
      const quote = canInstallFridge(gameState, item.fridgeTier as FridgeTier);
      return quote.price ?? item.cost;
    }
    return undefined;
  }

  function actionCheck(a: ActionDef): ReturnType<typeof canPerform> {
    const item = a.itemId ? getItem(a.itemId) : undefined;
    if (item?.fridgeTier) return canInstallFridge(gameState, item.fridgeTier as FridgeTier);
    return canPerform(gameState, a);
  }

  const selectedPurchaseActions = $derived(openPurchaseGroup?.actions.filter(action => selectedPurchaseIds.includes(action.id)) ?? []);
  const selectedPurchaseTotal = $derived(selectedPurchaseActions.reduce((sum, action) => sum + purchasePriceOf(gameState, action), 0));
  const selectedPurchaseCanCheckout = $derived(selectedPurchaseActions.length > 0
    && selectedPurchaseActions.every(action => actionCheck(action).ok)
    && selectedPurchaseTotal <= gameState.player.money);

  function setPurchaseSelection(id: string, checked: boolean): void {
    selectedPurchaseIds = checked
      ? [...new Set([...selectedPurchaseIds, id])]
      : selectedPurchaseIds.filter(selected => selected !== id);
  }

  function toggleGroup(id: string): void {
    openGroup = openGroup === id ? null : id;
    selectedPurchaseIds = [];
  }

  function checkoutPurchaseCart(): void {
    const result = performShoppingCart(gameState, selectedPurchaseIds);
    if (!result.ok) {
      showToast(`🚫 ${result.reason ?? "采购未完成"}`);
      return;
    }
    selectedPurchaseIds = [];
    openGroup = null;
    if (result.result) presentJobResult(result.result, undefined, {
      id: result.result.actionId, name: result.result.name, icon: result.result.icon,
    });
  }

  /** v1.38 P9：购买猫粮时弹出小/中/大包选择 */
  type FoodModal = { action: ActionDef; item: NonNullable<ReturnType<typeof getCatItem>> };
  const FOOD_SIZES = ["small", "medium", "large"] as const;
  let foodModal = $state<FoodModal | null>(null);
  function openFoodBuy(a: ActionDef): void {
    const item = a.catItemId ? getCatItem(a.catItemId) : undefined;
    if (item) foodModal = { action: a, item };
  }
  function buyFood(size: "small" | "medium" | "large"): void {
    if (!foodModal) return;
    const a = foodModal.action;
    foodModal = null;
    runAction(a, { catFoodSize: size });
  }
  function foodPrice(size: "small" | "medium" | "large"): number {
    if (!foodModal) return 0;
    const sz = CAT_FOOD_SIZE[size];
    return Math.round(foodModal.item.price * sz.qty * sz.priceMul);
  }

  /** v1.45 摆摊缺料时购买一份临时预制料理包，购买成功后直接继续开摊。 */
  type StallKitModal = { action: ActionDef; missing: string[] };
  let stallKitModal = $state<StallKitModal | null>(null);
  function isStallAction(a: ActionDef): boolean {
    return a.handler === "work_project" && !!a.projectId && isStallProject(a.projectId);
  }
  function buyStallKit(): void {
    const modal = stallKitModal;
    if (!modal) return;
    const projectId = modal.action.projectId;
    if (!projectId) return;
    const action = modal.action;
    const result = buyStallPrepKit(gameState, projectId);
    if (!result.ok) {
      showToast(`🚫 ${result.reason ?? "预制料理包购买失败"}`);
      return;
    }
    stallKitModal = null;
    runAction(action);
  }

  function doAction(a: ActionDef): void {
    if (gameState.districtLeisure?.active) { showToast("请先完成当前娱乐活动"); return; }
    if (!isLocationUnlocked(gameState, getLocation(a.locationId))) { showToast(locationLockReason(gameState, getLocation(a.locationId))); return; }
    // v1.45：衣柜与服装店是纯 UI 入口，不走普通行动结算，也不推进时间。
    if (a.handler === "open_wardrobe" || a.handler === "open_home_storage") {
      if (!isResidenceLocation(gameState)) {
        showToast("🚫 请先回到住处管理衣柜与收纳");
        return;
      }
      playInteractionSound(a.handler==='open_wardrobe'?'cloth':'drawer');uiState.modal = a.handler === "open_wardrobe" ? "wardrobe" : "home_storage";
      return;
    }
    if (a.handler === "open_clothing_store") {
      const openCheck = canPerform(gameState, a);
      if (!openCheck.ok) {
        showToast(`🚫 ${openCheck.reason ?? "服装店现在无法进入"}`);
        return;
      }
      uiState.modal = "clothing_store";
      return;
    }
    // v1.38 P9：猫粮购买先弹规格选择（小/中/大包）
    if (a.handler === "buy_cat_item") {
      const it = a.catItemId ? getCatItem(a.catItemId) : undefined;
      if (it && it.cat === "food") {
        openFoodBuy(a);
        return;
      }
    }
    // 睡觉行动卡：打开睡眠弹窗（绕过疲劳拦截）
    if (a.handler === "sleep_modal") {
      openSleep();
      return;
    }
    // v1.3：使用笔记本（打开全屏桌面）
    if (a.handler === "use_laptop") {
      // v1.43：统一走 projects 的电脑档位判定——自己买的电脑，或网吧上机期间。
      if (!hasLaptop(gameState)) {
        const expiredNetbar = gameState.locationId === "internet_cafe" && !!gameState.flags["netbar_session"];
        showToast(expiredNetbar
          ? "🚫 网吧机时已用完；明天可再付费上机"
          : "🚫 你还没有能用的电脑（商场可买笔记本，也可以去网吧上机）");
        return;
      }
      playInteractionSound('mouse');uiState.modal = "laptop";
      return;
    }
    // v1.43 网吧上机：付费拿到本次机位权限，然后直接打开笔记本桌面（网吧机 = 办公本档位）。
    if (a.handler === "netbar_session") {
      const session = startNetbarSession(gameState);
      if (!session.ok) {
        showToast(`🚫 ${session.reason ?? "现在不能上机"}`);
        return;
      }
      playInteractionSound('mouse');uiState.modal = "laptop";
      return;
    }
    // v1.4：车站行动统一打开车票面板，购票/检票由交通核心处理
    if (a.handler === "intercity_station") {
      const checkStation = canPerform(gameState, a);
      if (!checkStation.ok) {
        showToast(`🚫 ${checkStation.reason ?? "车站暂时无法使用"}`);
        return;
      }
      uiState.modal = "intercity";
      return;
    }
    // v1.33：宠物用品店领养猫咪（打开领养弹窗）
    if (a.handler === "pet_adopt") {
      uiState.modal = "pet_adopt";
      return;
    }
    // v1.33 P4d：游乐场赛场进入对决赛（开赛并开战，战斗界面由 pending 标记弹出）
    if (a.handler === "tournament_arena") {
      openTournamentArena(a);
      return;
    }
    // v1.34：公园「猫咪自由锻炼」（50% 加属性 / 50% 遭遇敌人，遭遇可决斗或逃跑）
    if (a.handler === "cat_free_train") {
      openFreeTrain(a);
      return;
    }
    // v1.34：游乐场「喵喵娱乐赛」（无需门票，立即开战，失败无惩罚）
    if (a.handler === "fun_match") {
      openFunMatch(a);
      return;
    }
    // v1.37：宠物医院「猫咪特殊训练 / 专注性训练」（打开卡牌训练弹窗）
    if (a.handler === "cat_special_train" || a.handler === "cat_focus_train") {
      const checkHosp = canPerform(gameState, a);
      if (!checkHosp.ok) {
        showToast(`🚫 ${checkHosp.reason ?? "现在做不了这件事"}`);
        return;
      }
      uiState.hospitalTrainMode = a.handler === "cat_special_train" ? "special" : "focus";
      uiState.modal = "hospital_train";
      return;
    }
    // v0.92：不满足条件时给出明确原因（原先静默返回，玩家不知道为什么点不动）
    const check = canPerform(gameState, a);
    if (!check.ok) {
      if (isStallAction(a) && a.projectId && check.reason?.startsWith("摆摊需要：")) {
        const ingredients = stallIngredientCheck(gameState, a.projectId);
        if (!ingredients.ok) {
          stallKitModal = { action: a, missing: ingredients.missing };
          return;
        }
      }
      showToast(`🚫 ${check.reason ?? "现在做不了这件事"}`);
      return;
    }
    // v0.92 便利店/水果摊：先问「堂食还是打包」
    if ((a.handler === "buy_food" || a.handler === "buy_fresh") && a.itemId) {
      openDineChoice(a);
      return;
    }
    runAction(a);
  }

  /** 真正执行行动（可带堂食/打包等选项） */
  function runAction(a: ActionDef, opts?: PerformOptions): void {
    // v0.91：体力 < 20 提示休息（不阻断）
    if (gameState.player.attrs.stamina < FATIGUE_WARN_THRESHOLD && gameState.player.attrs.stamina > 0) {
      showToast("😮‍💨 很累了，需要休息一下");
    }
    const r = performAction(gameState, a.id, opts);
    if (!r.ok) {
      showToast(`🚫 ${r.reason ?? "行动没能完成"}`);
      return;
    }
    if (a.handler === "read_book" && a.bookId) {
      const ev = rollEvent(gameState, a.eventChance);
      if (ev) uiState.pendingEvent = ev;
      uiState.pendingBookResult = r.result
        ? { payload: r.result, action: { id: a.id, name: a.name, icon: a.icon } }
        : null;
      uiState.readerId = a.bookId;
      uiState.modal = "reader";
      return;
    }
    if (r.result) {
      const ev = rollEvent(gameState, a.eventChance);
      if (ev) uiState.pendingEvent = ev;
      // v0.96 行动小游戏（锻炼 / 卖唱 / 摆摊等）：minigames.json 按 actionId 查配置
      const cfg = getMiniGameConfigFor(gameState, a.id);
      presentJobResult(r.result, cfg, { id: a.id, name: a.name, icon: a.icon });
    }
  }

  /** v1.33 P4d 游乐场赛场：进入对决赛（开赛并开战，战斗界面由 pending 标记弹出） */
  function openTournamentArena(a: ActionDef): void {
    const check = canPerform(gameState, a);
    if (!check.ok) {
      showToast(`🚫 ${check.reason ?? "现在进不了赛场"}`);
      return;
    }
    duelLobby.source="tournament";
    uiState.modal="cat_duel";
  }

  /** v1.34 公园自由锻炼：50% 属性提升直接结算；50% 遭遇敌人弹抉择框（决斗 / 逃跑） */
  function openFreeTrain(a: ActionDef): void {
    const check = canPerform(gameState, a);
    if (!check.ok) {
      showToast(`🚫 ${check.reason ?? "现在锻炼不了"}`);
      return;
    }
    const r = freeTrainCat(gameState);
    if (!r.ok) {
      showToast(`🚫 ${r.reason ?? "锻炼失败"}`);
      return;
    }
    if (r.kind === "battle") {
      uiState.encounterPayload = r.encounter;
      uiState.modal = "cat_encounter";
      return;
    }
    playSound("success");
    const label = TRAIN_LABEL[r.attr] ?? r.attr;
    // v1.37 卡包刷新：锻炼较低概率刷出新卡，直接弹入包抉择框（属性提升在弹窗关闭后由日志体现）
    if (r.cardOffer) {
      uiState.cardOfferPayload = { defId: r.cardOffer.defId, source: r.cardOffer.source, petUid: gameState.activePet ?? "" };
      uiState.modal = "card_offer";
      return;
    }
    showResult({
      actionId: a.id,
      icon: "🏋️",
      name: "猫咪自由锻炼",
      duration: a.duration ?? 0.5,
      deltas: [{ key: `cat_${r.attr}`, label, value: r.gain }],
      verdict: `「${activePetOf(gameState)?.name ?? "猫咪"}」在公园撒欢锻炼，${label} +${r.gain}！`,
    });
  }

  /** v1.34 游乐场喵喵娱乐赛：无需门票立即开战（casual：失败无惩罚，胜利随机加属性） */
  function openFunMatch(a: ActionDef): void {
    const check = canPerform(gameState, a);
    if (!check.ok) {
      showToast(`🚫 ${check.reason ?? "现在开不了赛"}`);
      return;
    }
    duelLobby.source="fun";
    uiState.modal="cat_duel";
  }

  /** 打开堂食/打包选择弹窗 */
  function openDineChoice(a: ActionDef): void {
    const item = a.itemId ? getItem(a.itemId) : undefined;
    if (!item) {
      runAction(a); // 兜底：物品数据缺失时按打包处理
      return;
    }
    uiState.dinePayload = {
      actionId: a.id,
      actionName: a.name,
      actionIcon: a.icon,
      itemName: item.name,
      itemIcon: item.icon,
      effectText: useEffectSummary(item.useEffects),
      price: purchasePriceOf(gameState,a),
    };
    uiState.modal = "dine";
  }

  /** 行动卡时长直接读取结算所用的时长规则。 */
  function actionDurationLabel(action: ActionDef): string {
    if (action.handler === "buy_food" || action.handler === "buy_fresh") {
      const eat = formatDuration(actionDurationHours(action, { dine: "eat" }));
      return `打包即时 / 堂食 ${eat}`;
    }
    const duration = actionDurationHours(action);
    if ((action.handler === "district_alcohol" || action.handler === "district_free_drink")
      && (gameState.districtServices?.alcoholCups ?? 0) === 5) {
      return `断片约 ${formatDuration(duration + DISTRICT_ALCOHOL_BLACKOUT_HOURS)}`;
    }
    return formatDuration(duration);
  }

  /** 物品使用效果摘要（"饱腹 +30 · 心情 +4"） */
  function useEffectSummary(e: Effects | undefined): string {
    if (!e) return "";
    const parts: string[] = [];
    const push = (label: string, v?: number) => {
      if (v) parts.push(`${label} ${signed(v)}`);
    };
    push("饱腹", e.satiety);
    push("心情", e.mood);
    push("体力", e.stamina);
    push("健康", e.health);
    push("干净度", e.hygiene);
    return parts.join(" · ");
  }

  function openSleep(): void {
    uiState.modal = "sleep";
  }

  /** v1.42：使用统一弹窗入口打开自由烹饪工作台，避免点击卡片后只改变局部状态。 */
  function openCooking(): void {
    openModal("cooking");
  }

  /** 当前地点可办理的日结与正式工作。 */
  const localJobs = $derived(localJobsOf(gameState.locationId));
  const venueWorkOptions = $derived.by(():CafeWorkOption[] => localJobs.map(job => {
    const preview = previewWork(gameState,job);
    const requiresHiring = job.kind === 'formal' && !isHired(job.id);
    const shift = job.kind === 'formal' && !requiresHiring ? getWorkShift(gameState,job) : undefined;
    const reason = requiresHiring ? '' : !gameState.work?.active
      ? (shift && shift.phase !== 'early' && shift.phase !== 'working' ? shift.label : workStatusReason(gameState))
      : '';
    return {id:job.id,title:job.name,detail:`${formatDuration(preview.duration)} · 本班约 ${formatMoney(preview.wage)} 元${job.kind === 'formal' ? ' · 每七天发薪' : ' · 下班到账'}`,requiresHiring,disabled:!!reason,reason:reason || undefined};
  }));

  function jobKindTag(kind: string): { text: string; cls: string } {
    return kind === "formal"
      ? { text: "正式工 · 周结", cls: "tag info" }
      : { text: "日结", cls: "tag cost" };
  }

  function borrowBook(action: ActionDef): void {
    if (action.handler !== "read_book" || !action.bookId || !isLibraryLocation(gameState.locationId)) return;
    const result = borrowLibraryBook(gameState, action.bookId);
    if (!result.ok) {
      showToast(`🚫 ${result.reason}`);
      return;
    }
    showToast(`已借阅《${result.book.name}》，回家后可在“看看书”中阅读。`);
  }

  function returnBorrowedBook(): void {
    const borrowed = loanedLibraryBook;
    if (!borrowed) {
      showToast("你目前没有外借图书。");
      return;
    }
    const result = returnLibraryBook(gameState, borrowed.id);
    if (!result.ok) {
      showToast(`🚫 ${result.reason}`);
      return;
    }
    showToast(`已归还《${result.book.name}》，现在可以借阅其他书籍。`);
  }

  function dayJobEndTime(hours: number): string {
    const now = nowWorkMinute(gameState);
    const end = now + Math.round(hours * 60);
    const clock = `${String(Math.floor(end % 1440 / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
    return `${Math.floor(end / 1440) > Math.floor(now / 1440) ? "次日" : "今天"} ${clock}`;
  }

  /** 是否已就职该岗 */
  function isHired(jobId: string): boolean {
    return gameState.career.jobId === jobId;
  }

  function doFixedJob(jobId: string): void {
    const selectedJob = getJobDef(jobId);
    if (!selectedJob) return;
    if (selectedJob.kind === "formal" && gameState.career.jobId !== jobId) {
      showToast("请先在手机「招聘」中直接入职，然后回单位上班");
      return;
    }
    if (selectedJob.kind === "formal" && !gameState.work?.active) {
      const shift = getWorkShift(gameState, selectedJob);
      if (shift.phase !== "early" && shift.phase !== "working") {
        showToast(shift.label || "当前没有待上班次");
        return;
      }
    }
    const warning = workStatusReason(gameState);
    if (warning && !gameState.work?.active) {
      showToast(warning);
      return;
    }
    const r = performJob(gameState, jobId);
    if (r.ok && r.result) {
      const cfg = getMiniGameConfigFor(gameState, jobId);
      presentJobResult(r.result, cfg, { id: selectedJob.id, name: selectedJob.name, icon: selectedJob.icon });
    } else if (!r.ok && r.reason) {
      showToast(r.reason);
    }
  }

  // v1.3b5：玻璃强度扩为 4 档，三级操作面板（action-card / loc-card / npc-panel）统一跟随。
  const GLASS_BG: Record<string, string> = {
    low: "linear-gradient(145deg, rgba(15,25,48,0.14), rgba(5,10,24,0.06))",
    medium: "linear-gradient(145deg, rgba(15,25,48,0.20), rgba(5,10,24,0.12))",
    high: "linear-gradient(145deg, rgba(15,25,48,0.38), rgba(5,10,24,0.30))",
    dark: "linear-gradient(145deg, rgba(8,12,26,0.82), rgba(3,6,16,0.76))",
  };
  const glassBg = $derived(GLASS_BG[uiState.mapGlass] ?? GLASS_BG.low);

  function go(locId:string):void{transitionRegion(()=>goNow(locId));}
  function goNow(locId: string): void {
    if(sceneLoading.current)return;
    if (!isNavigationTargetVisible(gameState, locId)) {
      showToast("该设施目前没有营业");
      return;
    }
    const fromL1 = isL1MapScene;
    const fromLocationId = gameState.locationId;
    const fromTop=loadingRegionOf(gameState);
    const r = moveTo(gameState, locId);
    if (!r.ok) {
      showToast(r.reason ?? "无法前往");
      return;
    }
    setL1BoundaryTransition(fromL1);
    // 普通同城地点移动即时切换；只有跨一级区域边界时才播放长途过场。
    if (locId !== fromLocationId && fromTop!==loadingRegionOf(gameState)) {
      beginTravelLoading();
    }
  }

  function goRegion(regionId:string):void{transitionRegion(()=>goRegionNow(regionId));}
  function goRegionNow(regionId: string): void {
    if(sceneLoading.current)return;
    const fromL1 = isL1MapScene;
    const fromTop=loadingRegionOf(gameState);
    const r = travelToRegion(gameState, regionId);
    if (!r.ok) {
      showToast(r.reason ?? "无法前往");
      return;
    }
    setL1BoundaryTransition(fromL1);
    // 一级地图之间的移动播放过场；二级地图只是打开区域菜单，不播放。
    if (fromTop!==loadingRegionOf(gameState)) beginTravelLoading();
  }

  /** 当前地点（派生） */
  const loc = $derived(
    gameState.locationId === "map" ? undefined : getLocation(gameState.locationId)
  );
  const STATION_IDS = new Set(["bus_station", "high_speed_rail", "suburb_bus_station", "suburb_train_station", "development_bus_station"]);
  function airportParent(): string {
    return getRegion(getLocation("airport")?.regions?.[0] ?? "development_airport")?.parent ?? "boyue";
  }
  const STATION_PERIODS = [
    { id: "morning", icon: "🌅", name: "上午", range: "05:00—11:00" },
    { id: "afternoon", icon: "☀️", name: "下午", range: "11:00—17:00" },
    { id: "evening", icon: "🌇", name: "黄昏", range: "17:00—23:00" },
    { id: "night", icon: "🌙", name: "深夜", range: "23:00—05:00" },
  ] as const;
  const isStationScene = $derived(STATION_IDS.has(gameState.locationId));
  // Native snapshots cover the whole region change; older engines use the keyed scene transition.
  const isL1MapScene = $derived(gameState.locationId === "map" && !gameState.region);
  let l1BoundaryTransition = $state(false);
  let l1BoundaryTimer: ReturnType<typeof setTimeout> | null = null;
  function setL1BoundaryTransition(active: boolean): void {
    if (l1BoundaryTimer) clearTimeout(l1BoundaryTimer);
    l1BoundaryTimer = null;
    l1BoundaryTransition = active;
    if (active) {
      l1BoundaryTimer = setTimeout(() => {
        l1BoundaryTransition = false;
        l1BoundaryTimer = null;
      }, Math.max(motionDurationMs("--dur-scene"), motionDurationMs("--dur-base")) + 50);
    }
  }
  onDestroy(() => {
    cancelRegionTransition();
    if (l1BoundaryTimer) clearTimeout(l1BoundaryTimer);
  });
  const stationTheme = $derived(themeOfHour(gameState.time.hour));
  const stationPeriod = $derived(periodOfHour(gameState.time.hour));
  /** home 地点动态名称 */
  const homeName = $derived(homeResidenceName(gameState));
  const mapHomeName = $derived(mapResidenceName(gameState));
  const atResidence = $derived(isResidenceLocation(gameState));
  const homeSceneId = $derived(currentHomeSceneId(gameState));
  const formalHome = $derived(!!homeSceneId);
  const needsResidenceRegistration = $derived(!atResidence && gameState.locationId !== "street"
    && !!housingAtLocation(gameState.locationId));
  const sceneTheme = $derived(themeOfHour(gameState.time.hour));
  const locBackground = $derived(loc ? currentSceneBackgroundUrl(gameState, sceneTheme) : undefined);
  const districtScene = $derived(isDistrictVisual(gameState.locationId));
  const districtLight = $derived(districtAtmosphere(gameState.locationId, gameState.time.hour, currentWeather(gameState), false));

  /** v1.43 修复：地图态精简状态条（饱食 / 精力 / 心情 三项）。
   * 地图选择态下 AttributeSidebar 整体收起，玩家按路程扣属性却看不到核心数值，
   * 容易在地图上饿晕 / 力竭。这里仅注入三项核心生存值的精简条，不引入其它 HUD。 */
  const mapMaxStamina = $derived(getMaxStamina(gameState));
  function clampPct(v: number): number {
    return Math.max(0, Math.min(100, v));
  }
  function mapAttrColor(v: number): string {
    if (v <= 20) return "var(--danger)";
    if (v <= 40) return "var(--warn)";
    return "var(--accent-2)";
  }
  function mapAttrSev(v: number): "ok" | "warn" | "danger" {
    if (v <= 20) return "danger";
    if (v <= 40) return "warn";
    return "ok";
  }
  const mapStatusCells = $derived.by(() => {
    const a = gameState.player.attrs;
    return [
      { name: "饱食", val: Math.round(a.satiety), pct: clampPct(a.satiety) },
      { name: "精力", val: Math.round(a.stamina), pct: clampPct((a.stamina / mapMaxStamina) * 100) },
      { name: "心情", val: Math.round(a.mood), pct: clampPct(a.mood) },
    ];
  });

  function artStyle(key: ActionVisualKey): string {
    if (uiState.actionCardBackground === "glass") return "";
    const url = actionTextureUrl(key);
    return url ? `--action-bg:url("${url}")` : "";
  }

  /** v1.3b3 当前在场、可被搭话/聊天的 NPC 列表（含关系状态） */
  const locNpcs = $derived(presentNpcs(gameState));
  const cafeScene = $derived(cafeSceneState(gameState,locNpcs));
  const storeScene = $derived(isConvenienceStore(gameState.locationId));
  const sceneIdentity=$derived(musicSession.value+':'+gameState.locationId+':'+(gameState.region??'')+':'+(homeSceneId??'')+':'+uiState.sceneMode);
  let sceneReload=$state(0),mapLoad:LoadingHandle|undefined;
  $effect(()=>{
    void sceneIdentity;void sceneReload;
    const request=untrack(()=>sceneLoadingTarget(gameState,uiState.sceneMode));
    const active=untrack(()=>sceneLoading.current);
    if(request.kind==='3d'||!active||active.sceneKey!==request.sceneKey)return;
    const handle=beginSceneLoading({...request,retry:()=>{beginSceneLoading(sceneLoadingTarget(gameState,uiState.sceneMode),true);sceneReload++;}});
    mapLoad=handle;
    return()=>{handle.cancel();if(mapLoad===handle)mapLoad=undefined;};
  });
  async function loadHomeInterior(){
    const task=beginSceneLoading({...sceneLoadingTarget(gameState,uiState.sceneMode),retry:()=>{beginSceneLoading(sceneLoadingTarget(gameState,uiState.sceneMode),true);sceneReload++;},fallback:uiState.sceneMode==='3d'?()=>{task.cancel();setSceneMode('2d');}:undefined});
    if(!await task.covered)throw new Error('Scene load cancelled');
    try{return await import('./HomeInterior.svelte');}catch(error){task.fail('住宅场景暂时无法载入，请重新载入。');throw error;}
  }
  function targetReady(key:string){if(key===sceneIdentity+':'+sceneReload)mapLoad?.ready();}
  function targetMounted(_node:HTMLElement,key:string){
    if(gameState.locationId==='map')return;
    let stopped=false,frame=0;
    frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>{if(!stopped)targetReady(key);});});
    return{destroy(){stopped=true;cancelAnimationFrame(frame);}};
  }
  const storeBlindBox = $derived(visibleSceneActions.find(a=>a.handler==='blind_box'));
  const storeBlindBoxCheck = $derived(storeBlindBox?canPerform(gameState,storeBlindBox):undefined);
  const cafeDrink = $derived(visibleSceneActions.find(a=>a.id===cafeScene.drinkActionId));
  const cafeOrderCheck = $derived(cafeDrink?canPerform(gameState,cafeDrink):{ok:false,reason:'暂无可用饮品'});
  function talkToCafeGuest():void {
    const guest=cafeScene.guest;
    if(guest)talkToCafePerson(guest.id);
  }
  function talkToCafePerson(id:string):void {
    const person=locNpcs.find(n=>n.id===id);
    if(person)openNpcTalk(person.id,person.known?'choose':'meet');
  }
  const pendingIntroduction = $derived(availableNpcIntroduction(gameState));

  /** v1.43 对未结识的在场 NPC 进入初见会话，不在入口处直接结算。 */
  function doMeet(id: string): void {
    openNpcTalk(id, "meet");
  }

  function mapScheduleText(location: { id: string; openHours?: { start: number; end: number } | null; weekendNightOnly?: boolean }): string {
    if (location.id === "moon_mountain") return "山道全天开放 · 东月道观 06:00–18:00";
    const hours = location.openHours;
    if (!hours) return "全天开放";
    const clock = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
    const end = hours.end < hours.start ? `次日 ${clock(hours.end)}` : clock(hours.end);
    const range = `${clock(hours.start)}–${end}`;
    return location.weekendNightOnly ? `周六、周日 ${range}` : `每日 ${range}`;
  }

  /** 区域地图展示真实建筑，并在当前入住建筑标记家；周末地点按日历显示。 */
  const regionItems = $derived(
    gameState.region && gameState.region !== "downtown"
      ? (() => {
          const activeHomeId = residenceLocationId(gameState);
          const baseHomeId = residenceLocationId(gameState, true);
          const list = locationsOfRegion(gameState.region).filter((location) => isResidenceBuildingVisible(gameState, location.id));
          return list
            .filter((l) => isLocationVisible(gameState, l))
            .map((l) => {
            const home = l.id === activeHomeId;
            const availability = locationAvailabilityAtArrival(gameState, l);
            const open = home || availability.open;
            const phase = availability.phase;
            return {
              id: l.id,
              name: home ? mapHomeName : l.id === baseHomeId ? permanentResidence(gameState).name : l.name,
              icon: l.icon,
              locked: !availability.unlocked,
              closed: !open,
              notYetOpen: phase === "before",
              // v0.935：开门前 2 小时内允许提前过去等着（工业园区提前到岗场景）
              early: !open && availability.early,
              // 地点处于营业时间也可能受通行证或内容开放状态限制；不要用 open 清掉门禁原因。
              closedText: availability.closedText,
              status: !availability.unlocked ? "locked" as const : open ? "open" as const : availability.early ? "early" as const : "closed" as const,
              disabledReason: !availability.unlocked ? availability.closedText : open ? undefined : availability.closedText,
              home,
              badge: home ? "家在这里" : l.id === baseHomeId ? "常住地址" : undefined,
              gradient: l.gradient,
              schedule: mapScheduleText(l),
              travelHours: travelHours(gameState, l),
              travelText: travelText(gameState, l),
            };
          });
        })()
      : []
  );

  /* ==================== v0.935 P1：原地等待 ==================== */

  /** 当前地点是否处于"还没开门"（可候场）状态 */
  const waitingForOpen = $derived(
    !!loc && !atResidence && !isLocationOpen(loc, gameState.time.hour, gameState) && locationOpenPhase(loc, gameState.time.hour, gameState) === "before"
  );
  /** 未开门提示文案 */
  const notOpenText = $derived(loc ? closedReason(loc, gameState.time.hour, gameState) : "");
  /** 可用等待档位 */
  const waitTiers = $derived(waitOptions(gameState));

  function doWait(hours: number): void {
    // v1.43：智能档（等到开门）缺口可能超过单次等待上限，此时放开上限（最多等到 24h）。
    const r = waitHere(gameState, hours, hours > WAIT_MAX_HOURS ? { max: 24 } : undefined);
    if (!r.ok) {
      showToast(`🚫 ${r.reason ?? "现在没法等"}`);
      return;
    }
    playSound("walk");
    if (r.result) showResult(r.result);
  }

  /** 面包屑层级 */
  type Crumb = { id: string; label: string; icon: string };
  const crumbs = $derived.by((): Crumb[] => {
    const out: Crumb[] = [{ id: "map", label: "城市", icon: "🗺️" }];
    for (const id of gameState.navStack) {
      if (id === "map") continue;
      // 机场二级入口就是机场设施，不增加只含一个点的中间地图。
      if (id === "development_airport" && gameState.locationId === "airport") continue;
      const r = getRegion(id);
      out.push({ id, label: r?.name ?? id, icon: r?.icon ?? "📍" });
    }
    if (loc) {
      out.push({ id: loc.id, label: atResidence ? homeName : loc.name, icon: loc.icon });
    }
    return out;
  });

  /** 手游地图把路径、地点与等待合并为一个完整中央画布。
   * 只要已经进入一级区域（L2/L3），导航就和地图一起占据中央栏；
   * 主地图（L1）没有额外导航，不人为预留顶部空间。 */
  const integrateMobileMap = $derived(
    isMobileLayout()
      && gameState.locationId === "map"
      && crumbs.length > 1,
  );

  /** v1.41：隐藏一级总览地图后，地图态直接展示当前城市的二级区域图。 */
  const mapParentRegionId = $derived.by(() => {
    if (gameState.region) {
      const current = getRegion(gameState.region);
      return current?.parent ?? gameState.region;
    }
    return topRegionOf(gameState.area ?? currentRegion(gameState)) ?? "downtown";
  });

  /** v0.98 场景切换方向：深度 → 向右滑入；返回 → 向左滑出 */
  let prevDepth = $state(0);
  let flyX = $state(60);
  $effect(() => {
    const cur = gameState.navStack.length + (gameState.locationId !== "map" ? 1 : 0);
    flyX = cur > prevDepth ? 60 : -40;
    prevDepth = cur;
  });

  /** 点击面包屑回退到指定层 */
  function crumbTo(i:number):void{transitionRegion(()=>crumbToNow(i));}
  function crumbToNow(i: number): void {
    if(sceneLoading.current)return;
    if (gameState.districtLeisure?.active) { showToast("请先完成当前娱乐活动"); return; }
    if (gameState.flags["hospitalized"]) {
      showToast("正在住院，先到医院办理出院");
      return;
    }
    if (i <= 0) {
      setL1BoundaryTransition(true);
      returnFromInterior(()=>goToMap(gameState));
      return;
    }
    const id = crumbs[i]?.id;
    if (!id) return;
    // 地点层（最后一层）→ 回退到所在区域视图
    if (loc && i === crumbs.length - 1) {
      setL1BoundaryTransition(isL1MapScene);
      returnFromInterior(()=>{
        if (gameState.locationId === "airport") enterRegion(gameState, airportParent());
        else if (gameState.region) enterRegion(gameState, gameState.region);
        else goToMap(gameState);
      });
      return;
    }
    // 区域层
    const r = getRegion(id);
    if (r) {
      setL1BoundaryTransition(isL1MapScene);
      returnFromInterior(()=>enterRegion(gameState, id));
    }
  }

  /** 出门按钮文案 */
  const exitLabel = $derived.by(() => {
    if (gameState.locationId === "airport") return `🚪 出门 / 回${getRegion(airportParent())?.name ?? "泊月区"}`;
    if (gameState.region) {
      const r = getRegion(gameState.region);
      return `🚪 出门 / 回${r?.name ?? "区域"}`;
    }
    return "🚪 出门 / 回主地图";
  });

  function exitLocation():void{transitionRegion(exitLocationNow);}
  function exitLocationNow(): void {
    if(sceneLoading.current)return;
    // 住院拦截
    if (gameState.flags["hospitalized"]) {
      showToast("正在住院，先到医院办理出院");
      return;
    }
    const toL1 = !gameState.region;
    setL1BoundaryTransition(isL1MapScene || toL1);
    returnFromInterior(()=>{
      if (gameState.locationId === "airport") enterRegion(gameState, airportParent());
      else if (gameState.region) enterRegion(gameState, gameState.region);
      else goToMap(gameState);
      playSound("walk");
    });
  }

  let departureOpen = $state(false);
  function homeDeparture(): void {
    if (isResidenceLocation(gameState) && (gameState.company || cityHotelGuest(gameState))) departureOpen = !departureOpen;
    else exitLocation();
  }
  function leaveForCompany(): void {
    if (sceneLoading.current) return;
    const result = commuteToCompany(gameState);
    if (!result.ok) { showToast(result.reason ?? '暂时无法前往公司'); return; }
    departureOpen = false;
    setL1BoundaryTransition(false);
    beginTravelLoading();
    playSound('walk');
  }
  function homeDining(): void {
    const meal = visibleSceneActions.find(action => ['mooncourt_dining', 'hotel_resident_dining'].includes(action.id));
    if (meal) { departureOpen = false; doAction(meal); }
  }
  $effect(() => { if (!isResidenceLocation(gameState)) departureOpen = false; });

  function returnFromInterior(navigate:()=>void):void {
    if(sceneLoadingTarget(gameState,uiState.sceneMode).kind!=='3d'){navigate();return;}
    const destination={...gameState,locationId:'map'};
    const task=beginSceneLoading({...sceneLoadingTarget(destination,'2d'),minimumMs:500});
    // Paint before disposing the old renderer or mounting/decoding the map.
    void task.covered.then(covered=>{
      if(!covered||!task.active())return;
      try{navigate();}catch(error){task.fail(error);}
    });
  }

  /** v0.985：消费引擎写入的待弹窗塔罗牌解锁队列，逐条弹 toast 后清空 */
  const ROMAN = [
    "0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
    "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI",
  ];
  $effect(() => {
    // 只读队列长度做触发；消费（含清空）走 consumePendingTarot action，不在此处自写状态。
    if (gameState.pendingTarot.length === 0) return;
    for (const id of consumePendingTarot(gameState)) {
      const card = tarotCard(id);
      showToast(
        card
          ? `🔮 塔罗牌点亮：${ROMAN[card.id]} · ${card.name}（${card.symbol}）`
          : `🔮 塔罗牌点亮：${id}`,
      );
    }
  });
  onMount(()=>{const fallback=()=>{
    const task=beginSceneLoading({...sceneLoadingTarget(gameState,uiState.sceneMode),retry:()=>{sceneReload++;},fallback:uiState.sceneMode==='3d'?()=>setSceneMode('2d'):undefined});
    task.fail(uiState.sceneMode==='3d'?'3D 场景已中断，可以重新载入或选择 2D 场景。':'2D 场景图片暂时无法载入，请重新载入。');
  };document.addEventListener('scene-context-lost',fallback);return()=>document.removeEventListener('scene-context-lost',fallback);});
</script>

{#snippet survivalStrip()}
    <div class="map-survival-strip hud-scope" aria-label="核心状态（地图态精简）">
      {#each mapStatusCells as c}
        <div class="ms-cell ms-{mapAttrSev(c.val)}">
          <span class="ms-name">{c.name}</span>
          <span class="ms-track"><span class="ms-fill" style="width:{c.pct}%;background:{mapAttrColor(c.val)}"></span></span>
          <span class="ms-val">{c.val}</span>
        </div>
      {/each}
    </div>
{/snippet}

<div class="scene hud-scope" class:home-scene={companyOffice || formalHome || cafeScene.enabled || storeScene} class:station-scene={isStationScene} style:--panel-glass-bg={glassBg}>
  {#if isStationScene}
    <div
      class="station-ambient"
      class:ambient-day={stationTheme === "day"}
      class:ambient-dusk={stationTheme === "dusk"}
      class:ambient-night={stationTheme === "night"}
      aria-hidden="true"
    ></div>
  {/if}
  {#key sceneIdentity+':'+sceneReload}
    {@const renderedScene=sceneIdentity+':'+sceneReload}
    <div
      class="scene-body"
      use:targetMounted={renderedScene}
      class:home-body={companyOffice || formalHome || cafeScene.enabled || storeScene}
      class:map-integrated={integrateMobileMap}
      class:atlas-nav-overlay={gameState.locationId === "map" && !!gameState.region && !getRegion(gameState.region)?.parent && !integrateMobileMap}
      in:fly={{ x: isL1MapScene || l1BoundaryTransition ? flyX : 12, duration: sceneLoading.current || nativeRegionTransitionActive() ? 0 : motionDurationMs("--dur-scene"), easing: motionEasing("--ease-out") }}
      out:fade={{ duration: nativeRegionTransitionActive()?0:motionDurationMs("--dur-base"), easing: motionEasing("--ease-out") }}
    >
  {#if !companyOffice && !integrateMobileMap && !formalHome && !cafeScene.enabled && !storeScene}
    <!-- 普通地图/地点沿用外部导航；手游三级地图由 CityMapView 内部承载。 -->
    <div class="scene-nav-frame">
      {#if crumbs.length > 1}
        <nav class="breadcrumbs">
          {#each crumbs as c, i (c.id)}
            {#if i > 0}<span class="sep">›</span>{/if}
             <button class="crumb" disabled={i === crumbs.length - 1} aria-current={i === crumbs.length - 1 ? "page" : undefined} onclick={() => crumbTo(i)} class:last={i === crumbs.length - 1}>
              <span class="gi-emoji" style="font-size:13px;line-height:1">{c.icon}</span>
              {c.label}
            </button>
          {/each}
        </nav>
      {/if}
      {#if gameState.locationId === "map" && gameState.region && !getRegion(gameState.region)?.parent}
        <nav class="loc-nav">
          <button class="loc-chip back-chip" onclick={() => crumbTo(Math.max(0, crumbs.length - 2))}>← 返回上一级</button>
          {#if gameState.region !== "downtown"}
            <button class="loc-chip back-chip" onclick={() => crumbTo(0)}>🗺️ 回主地图</button>
          {/if}
        </nav>
      {:else if gameState.locationId !== "map"}
        <nav class="loc-nav">
          <button class="loc-chip exit-chip" data-home-departure={isResidenceLocation(gameState) ? '' : undefined} aria-expanded={isResidenceLocation(gameState) ? departureOpen : undefined} onclick={homeDeparture}>{exitLabel}</button>
          {#if departureOpen && isResidenceLocation(gameState)}<div class="flat-home-departure"><HomeDepartureMenu onDining={homeDining} onExit={()=>{departureOpen=false;exitLocation();}} onCompany={leaveForCompany} onClose={()=>departureOpen=false}/></div>{/if}
        </nav>
      {/if}
      {#if gameState.locationId === "map" && !(gameState.region && !getRegion(gameState.region)?.parent)}{@render survivalStrip()}{/if}
    </div>
  {/if}
  {#if gameState.locationId === "map"}
    <!-- v1.43 修复：地图态精简状态条（饱食 / 精力 / 心情）。地图工具栏附近，不遮挡地图交互。 -->
    {#if integrateMobileMap || (gameState.region && !getRegion(gameState.region)?.parent)}
      {@render survivalStrip()}
    {/if}
    <!-- v1.41：隐藏 L1 总览，直接进入当前城市的 L2 区域选择。 -->
    {#if !gameState.region}
      <RegionMapView
        onReady={()=>targetReady(renderedScene)}
        parentRegionId={mapParentRegionId}
        onSelect={(id) => goRegion(id)}
        breadcrumbs={[]}
        showBack={false}
        showHome={false}
      />
    {:else if !getRegion(gameState.region)?.parent}
      <!-- L2：四个一级区域 → 子区域地图 -->
      <RegionMapView
        onReady={()=>targetReady(renderedScene)}
        parentRegionId={gameState.region}
        onSelect={(id) => goRegion(id)}
        breadcrumbs={integrateMobileMap ? crumbs : []}
        onCrumb={(index) => crumbTo(index)}
        showBack={integrateMobileMap}
         showHome={gameState.region !== "downtown"}
         onBack={() => crumbTo(Math.max(0, crumbs.length - 2))}
         onHome={() => goRegion("downtown")}
      />
    {:else}
      <!-- L3：区域地点网格 -->
      <CityMapView
        onReady={()=>targetReady(renderedScene)}
        regionId={gameState.region}
        items={regionItems}
        onSelect={(id) => go(id)}
        showBack={true}
        showHome={gameState.region !== "downtown"}
        onBack={() => crumbTo(Math.max(0, crumbs.length - 2))}
        onHome={() => crumbTo(Math.max(1, crumbs.length - 2))}
        breadcrumbs={integrateMobileMap ? crumbs : []}
        onCrumb={(index) => crumbTo(index)}
        waitItems={[]}
        onWait={(hours) => doWait(hours)}
      />
      <!-- v0.935：街面等待（等园区/店铺开门）。手游下等待集成进左侧状态栏，不再占地图整行。 -->
      {#if !integrateMobileMap && !isMobileLayout()}
        <div class="wait-bar">
          <span class="wait-label">⏳ 在街上等一会儿</span>
          {#each waitTiers as t}
            <button class="wait-btn" class:smart={t.smart} onclick={() => doWait(t.hours)}>{t.label}</button>
          {/each}
        </div>
      {/if}
    {/if}
  {:else if companyOffice}
    <CompanyInterior onExit={exitLocation} waitOptions={waitTiers} onWait={doWait}/>
  {:else if formalHome}
    {#await untrack(()=>loadHomeInterior()) then {default: HomeInterior}}
    <HomeInterior actions={visibleSceneActions} onAction={doAction} onCooking={openCooking} onExit={exitLocation} onCompany={leaveForCompany}/>
    {:catch}
      <div class="scene-loading" role="status">房间暂时无法加载。<button onclick={()=>sceneReload++}>重新载入</button>{#if uiState.sceneMode==='3d'}<button onclick={()=>setSceneMode('2d')}>使用 2D 场景</button>{/if}</div>
    {/await}
  {:else if storeScene}
    <StoreInterior
      night={gameState.time.hour>=18 || gameState.time.hour<6}
      products={retailProducts} onExit={exitLocation} {exitLabel}
      workOptions={venueWorkOptions} onWork={doFixedJob} waitOptions={waitTiers} onWait={doWait}
      people={locNpcs} onTalk={talkToCafePerson} introduction={pendingIntroduction??undefined}
      onIntroduction={pendingIntroduction?()=>openNpcTalk(pendingIntroduction.participants[0],'introduction',pendingIntroduction.id):undefined}
      blindBox={storeBlindBox?{title:storeBlindBox.name,detail:`${formatMoney(Math.abs(effectsOf(storeBlindBox).money??0))}元 · ${actionDurationLabel(storeBlindBox)}`,disabled:!storeBlindBoxCheck?.ok,reason:storeBlindBoxCheck?.reason}:undefined}
      onBlindBox={storeBlindBox?()=>doAction(storeBlindBox):undefined}
    />
  {:else if cafeScene.enabled}
    <CafeInterior
      night={cafeScene.night} linPresent={cafeScene.linPresent}
      linName={cafeScene.guest?.displayName} linKnown={cafeScene.guest?.known}
      onNpc={talkToCafeGuest} onTalk={talkToCafePerson} people={locNpcs}
      onOrder={cafeDrink?()=>doAction(cafeDrink):undefined}
      orderLabel={cafeDrink?`拿铁 · ${formatMoney(Math.abs(effectsOf(cafeDrink).money??0))}元 · ${actionDurationLabel(cafeDrink)}`:undefined}
      orderDisabled={!cafeOrderCheck.ok} orderReason={cafeOrderCheck.reason}
      onExit={exitLocation} {exitLabel} workOptions={venueWorkOptions} onWork={doFixedJob}
      activities={visibleSceneActions.filter(a=>a.id.includes('_sofa_')||a.handler==='buy_food'||a.id.endsWith('_read_magazine'))} onActivity={doAction}
      introduction={pendingIntroduction??undefined}
      onIntroduction={pendingIntroduction?()=>openNpcTalk(pendingIntroduction.participants[0],'introduction',pendingIntroduction.id):undefined}
    />
  {:else}
    <!-- 地点场景 -->
    {#if loc}
      <div
        class="loc-card"
        class:has-scene-bg={!!locBackground}
        data-theme={sceneTheme}
        data-district={districtScene ? "true" : undefined}
        style:--district-filter={districtLight.filter}
        style={locBackground ? `--loc-bg:url("${locBackground}")` : `background:${loc.gradient}`}
      >
        <div class="loc-info">
          <div class="loc-eyebrow">当前地点</div>
          <div class="loc-name">{atResidence ? homeName : loc.name}</div>
          <div class="loc-desc">{atResidence ? "这里是你当前入住的住处，居家功能按住宿设施开放" : loc.desc}</div>
          {#if needsResidenceRegistration}
            <div class="loc-desc">尚未入住这里。当前住处：{homeName}。完成此处入住登记后，居家功能会在这里开放。</div>
          {/if}
        </div>
      </div>
    {/if}

    <NpcTaskCounter />

    {#if isStationScene}
      <section class="station-timebar" data-theme={stationTheme} aria-label="车站时段">
        <div class="station-timebar-head">
          <span>🕒 车站时段</span>
          <span class="station-now">当前 {periodLabel(stationPeriod)} · {String(gameState.time.hour).padStart(2, "0")}:{String(gameState.time.minute).padStart(2, "0")}</span>
        </div>
        <div class="station-periods">
          {#each STATION_PERIODS as period}
            <div class="station-period" class:active={period.id === stationPeriod}>
              <span class="station-period-name">{period.icon} {period.name}</span>
              <span class="station-period-range">{period.range}</span>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <DistrictServicesPanel />
    <CommercialServicesPanel />
    <ServiceWindows onAction={doAction}/>
    <StreetBargain/>
    <DistrictLeisurePanel />
    <FishingPanel />
    {#if pendingIntroduction}
      <section class="npc-panel" aria-label="特别相遇">
        <div class="npc-panel-head">👥 {pendingIntroduction.title}</div>
        <div class="npc-row"><div class="npc-row-info"><p>{pendingIntroduction.description}</p></div><button type="button" class="npc-row-btn meet" data-npc-introduction={pendingIntroduction.id} onclick={() => openNpcTalk(pendingIntroduction.participants[0], 'introduction', pendingIntroduction.id)}>上前打招呼</button></div>
      </section>
    {/if}
    {#if locNpcs.length > 0}
      <div class="npc-panel">
        <div class="npc-panel-head">🧑‍🤝‍🧑 这里的人</div>
        {#each locNpcs as n (n.id)}
          <div class="npc-row">
            <PortraitStack
              portrait={npcPortraitForContext(n.id, n.outfitContext, "default", true, currentNpcWeatherOutfit)}
              className="npc-card-portrait"
              alt={n.displayName}
            />
            <div class="npc-row-info">
              <div class="npc-row-name">{n.displayName}</div>
              <div class="npc-row-badges">
                <span class="npc-row-badge" class:stranger={!n.known}>{n.stateLabel}</span>
                {#if n.known && npcFormalTopics(gameState, n.id).length > 0}<span class="npc-row-badge formal-ready">有事商量</span>{/if}
              </div>
            </div>
            {#if n.known}
              <button class="npc-row-btn" onclick={() => openNpcTalk(n.id, "choose")}>交谈</button>
            {:else}
              <button class="npc-row-btn meet" onclick={() => doMeet(n.id)}>搭话认识</button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    <!-- v0.935：提前到岗候场提示 + 原地等待 -->
    {#if waitingForOpen}
      <div class="early-banner">
        <span class="eb-title">⏳ 还没开门</span>
        <span class="eb-text">{notOpenText}——你先在门口候着，等开门再进去。</span>
      </div>
    {/if}
    <!-- v1.43.x：手游等待已集成进左侧状态栏，悬浮开关与整行等待条一并移除（不再遮挡场景） -->
    {#if !isMobileLayout()}
      <button
        class="mobile-wait-toggle"
        type="button"
        aria-expanded={mobileWaitOpen}
        aria-controls="mobile-indoor-wait"
        onclick={() => (mobileWaitOpen = !mobileWaitOpen)}
      >{mobileWaitOpen ? "⌄ 收起等待" : "⏳ 等待"}</button>
    {/if}
    {#if !isMobileLayout()}
      <div class="wait-bar" id="mobile-indoor-wait">
        <span class="wait-label">⏳ 原地等待</span>
        {#each waitTiers as t}
          <button class="wait-btn" class:smart={t.smart} onclick={() => doWait(t.hours)}>{t.label}</button>
        {/each}
      </div>
    {/if}

    {#if localJobs.length > 0}
      <div class="fixed-jobs">
        <div class="fj-head">💼 本地工作</div>
        {#each localJobs as job}
          {@const kt = jobKindTag(job.kind)}
          {@const shift = job.kind === "formal" && isHired(job.id) ? getWorkShift(gameState, job) : undefined}
          {@const preview = previewWork(gameState, job)}
          <button class="action-card fj-card" class:classic-bg={uiState.actionCardBackground === "glass"} style={artStyle("work")} onclick={() => doFixedJob(job.id)}>
            <div class="action-head">
              <div class="head-right">
                <span class={kt.cls}>{kt.text}</span>
                <span class="tag info duration">🕐 {formatDuration(preview.duration)}</span>
                <span class="tag gain">
                  {job.kind === "formal" ? `📅 每七天发薪 · 本班约 ${formatMoney(preview.wage)} 元` : `💰 下班到账约 ${formatMoney(preview.wage)} 元`}
                </span>
              </div>
            </div>
            <div class="action-name">{job.name}</div>
            <div class="action-desc">{job.desc}</div>
            <div class="action-desc">⚡ 体力 {preview.stamina} · 压力 {preview.stress >= 0 ? "+" : ""}{preview.stress}</div>
            {#if job.kind === "formal"}
              <div class="action-lock">{isHired(job.id) ? shift?.label ?? "查看班次" : "先在手机「招聘」直接入职"}</div>
            {:else}
              <div class="action-lock">▶ 开始工作 · 预计 {dayJobEndTime(preview.duration)} 下班 · 完成小游戏后到账</div>
            {/if}
            {#if preview.warning}<div class="action-lock">⚠️ {preview.warning}</div>{/if}
          </button>
        {/each}
      </div>
    {/if}

    {#if gameState.locationId === "labor_market"}
      <JobBoard />
    {:else}
      <!-- v0.97 分组入口（烹饪 / 开发）：点开展开组内具体操作 -->
      {#if gameState.locationId === "flower_market" && flowerFacility === null}
        <section class="flower-facilities" aria-label="花鸟市场内设施">
          <div class="flower-facilities-head">
            <span>🐾 市场内宠物设施</span>
            <span class="dim">猫咪用品与护理分区经营，不和花鸟摊位混在一起</span>
          </div>
          <div class="flower-facilities-grid">
            <button class="facility-card pet-shop-facility" class:classic-bg={uiState.actionCardBackground === "glass"} style={artStyle("market")} onclick={() => { flowerFacility = "pet_store"; openGroup = null; }}>
              <span class="facility-icon" aria-hidden="true"></span>
              <span class="facility-copy">
                <span class="facility-name">宠物用品店</span>
                <span class="facility-desc">猫粮、玩具、寝具、自动设备、训练用品、饰品和领养</span>
              </span>
              <span class="facility-arrow">→</span>
            </button>
            <button class="facility-card pet-hospital-facility" class:classic-bg={uiState.actionCardBackground === "glass"} style={artStyle("medical")} onclick={() => { flowerFacility = "pet_hospital"; openGroup = null; }}>
              <span class="facility-icon" aria-hidden="true"></span>
              <span class="facility-copy">
                <span class="facility-name">宠物医院</span>
                <span class="facility-desc">猫咪治疗、专项训练和护理用特殊道具</span>
              </span>
              <span class="facility-arrow">→</span>
            </button>
          </div>
        </section>
      {:else if gameState.locationId === "flower_market" && flowerFacility !== null}
        <div class="flower-facility-nav">
          <button class="facility-back" onclick={() => { flowerFacility = null; openGroup = null; }}>← 返回花鸟市场</button>
          <span><strong>{flowerFacility === "pet_store" ? "宠物用品店" : "宠物医院"}</strong><span class="dim"> · 猫咪专用服务</span></span>
        </div>
      {/if}

      <div class="group-grid">
        {#if retailProducts.length>=2}<button class="group-card retail-entry" data-facility-shop aria-label="选购商品" onclick={()=>openModal('facility_shop')}><span class="group-icon" aria-hidden="true">🛒</span><span class="group-copy"><span class="group-name">选购商品</span><span class="group-desc">{retailCategories.join(' · ')}<br/>分类挑选，统一结算</span></span><span class="group-count dim">{retailProducts.length} 件</span></button>{/if}
        {#if gameState.locationId === "flower_market" && flowerFacility === "pet_store"}
          <button class="group-card" onclick={() => { uiState.catPanelTab = "foster"; uiState.modal = "cat"; }}>
            <span class="group-icon" aria-hidden="true">🏡</span>
            <span class="group-copy"><span class="group-name">猫咪寄养</span><span class="group-desc">免费代为照料，可随时领回</span></span>
          </button>
        {/if}
        {#each purchaseGroups as g}
          <button class="group-card purchase-group-card" class:open={openGroup === g.id} class:classic-bg={uiState.actionCardBackground === "glass"} style={artStyle("market")} aria-expanded={openGroup === g.id} onclick={() => toggleGroup(g.id)}>
            <span class="group-icon" aria-hidden="true">{g.icon}</span>
            <span class="group-copy"><span class="group-name">{g.name}</span><span class="group-desc">{g.desc}</span></span>
            <span class="group-count dim">{g.actions.length} 种</span>
          </button>
        {/each}
        {#each furnitureGroups as g}
          <button class="group-card furniture-group-card" class:open={openGroup === g.id} class:classic-bg={uiState.actionCardBackground === "glass"} style={artStyle("market")} aria-expanded={openGroup === g.id} onclick={() => toggleGroup(g.id)}>
            <span class="group-icon" aria-hidden="true">{g.icon}</span>
            <span class="group-copy"><span class="group-name">{g.name}</span><span class="group-desc">{g.desc}</span></span>
            <span class="group-count dim">{g.actions.length} 件</span>
          </button>
        {/each}
        {#each ACTION_GROUPS as g}
          {@const items = groupItems(g.id)}
          {@const forceFold = ["cat", "cat_train"].includes(g.id)}
          {#if (!(["cat", "cat_train"].includes(g.id)) || availableCats.length > 0) && items.length > 0 && (items.length > 3 || forceFold)}
            {@const groupVisual = visualKeyForGroup(g.id)}
            {#if g.id === "cat"}
              <div class="cat-group-entry">
                <button class="group-card" class:classic-bg={uiState.actionCardBackground === "glass"} style={artStyle(groupVisual)} onclick={() => { uiState.catPanelTab = "care"; uiState.modal = "cat"; }}>
                  <span class="group-icon" aria-hidden="true">{g.icon}</span>
                  <span class="group-copy"><span class="group-name">{g.name}</span><span class="group-desc">照顾、状态与用品</span></span>
                </button>
                <button class="cat-carry-quick" onclick={() => { uiState.catPanelTab = "carry"; uiState.modal = "cat"; }}>携带</button>
              </div>
            {:else}
              <button class="group-card" class:open={openGroup === g.id} class:classic-bg={uiState.actionCardBackground === "glass"} style={artStyle(groupVisual)} aria-expanded={openGroup === g.id} onclick={() => toggleGroup(g.id)}>
                <span class="group-icon" aria-hidden="true">{g.icon}</span>
                <span class="group-copy"><span class="group-name">{g.name}</span><span class="group-desc">{g.desc}</span></span>
                <span class="group-count dim">{items.length} 种</span>
              </button>
            {/if}
          {/if}
        {/each}
      </div>

      {#if gameState.locationId === "flower_market" && flowerFacility === null && gameState.smallPets.length > 0}
        <section class="small-pets-panel">
          <div class="small-pets-head">
            <span>🐾 小宠物照料区</span>
            <span class="dim">只保留饥饿和心情</span>
          </div>
          <div class="small-pets-list">
            {#each gameState.smallPets as pet (pet.uid)}
              {@const feedAction = visibleSceneActions.find((a) => a.handler === "small_pet_care" && a.smallPetAction === "feed" && a.smallPetKind === pet.kind)}
              {@const comfortAction = visibleSceneActions.find((a) => a.handler === "small_pet_care" && a.smallPetAction === "comfort")}
              {@const checkupAction = visibleSceneActions.find((a) => a.handler === "small_pet_checkup")}
              <div class="small-pet-row" class:classic-bg={uiState.actionCardBackground === "glass"} style={artStyle("market")}>
                <div class="small-pet-info">
                  <span class="small-pet-icon" data-kind={pet.kind} aria-hidden="true"></span>
                  <div>
                    <div class="small-pet-name">{pet.name}</div>
                    <div class="small-pet-stats">饥饿 {pet.hunger}/100 · 心情 {pet.mood}/100</div>
                  </div>
                </div>
                <div class="small-pet-actions">
                  <button class="mini-btn" disabled={!feedAction || !canPerform(gameState, feedAction).ok} onclick={() => feedAction && runAction(feedAction, { smallPetUid: pet.uid })}>喂食</button>
                  <button class="mini-btn" disabled={!comfortAction} onclick={() => comfortAction && runAction(comfortAction, { smallPetUid: pet.uid })}>安抚</button>
                  <button class="mini-btn" disabled={!checkupAction || !canPerform(gameState, checkupAction).ok} onclick={() => checkupAction && runAction(checkupAction, { smallPetUid: pet.uid })}>体检</button>
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#snippet actionCard(action: ActionDef)}
        {@const check = actionCheck(action)}
        {@const tags = actionTags(action)}
        {@const actionVisual = visualKeyForAction(action)}
        {@const durationLabel = actionDurationLabel(action)}
        {@const proj = action.handler === "work_project" && action.projectId ? projectProgress(gameState, action.projectId) : null}
        {@const projDone = action.handler === "work_project" && action.projectId ? isProjectDone(gameState, action.projectId) : false}
        <div class="action-card-shell" class:borrowable={isLibraryLocation(gameState.locationId) && action.handler === "read_book" && !!action.bookId}>
        <button class="action-card" class:disabled={!check.ok} class:classic-bg={uiState.actionCardBackground === "glass"} disabled={!check.ok} title={!check.ok ? check.reason : undefined} onclick={() => doAction(action)} style={artStyle(actionVisual)}>
          <div class="action-head">
            <div class="head-right">
              <span class="tag info duration" title="行动完成后会推进的游戏时间">🕐 {durationLabel}</span>
              <div class="tags">
                {#each tags.slice(0, 2) as t}
                  <span class="tag {t.cls}">{t.text}</span>
                {/each}
                {#if priceForAction(action) != null}
                  <span class="tag cost">💰 {formatMoney(priceForAction(action)!)}</span>
                {/if}
              </div>
            </div>
          </div>
          <div class="action-name">{action.name}</div>
          <div class="action-desc">
            {action.desc}
            {#if action.handler === "train_study"}
              <br />📋 {trainingProgressLabel(gameState)}
            {/if}
            {#if action.id === "resign_job" && gameState.career.jobId}
              · 离职将结清工资 {formatMoney(resignationSalaryPreview(gameState))} 元
            {/if}
          </div>
          {#if proj !== null}
            <div class="proj-bar-wrap">
              <div class="proj-bar" class:done={projDone}>
                <div class="proj-fill" style="width:{proj}%"></div>
              </div>
              <span class="proj-pct">{projDone ? "✅ 已完成" : `${proj}%`}</span>
            </div>
          {/if}
          {#if !check.ok}<div class="action-lock">🔒 {check.reason}</div>{/if}
        </button>
        {#if isLibraryLocation(gameState.locationId) && action.handler === "read_book" && action.bookId}
          <button
            class="borrow-book-button"
            disabled={!!loanedLibraryBook}
            title={loanedLibraryBook ? `请先归还《${loanedLibraryBook.name}》` : "借回家中阅读"}
            onclick={() => borrowBook(action)}
          >
            {loanedLibraryBook ? `已有借阅：${loanedLibraryBook.name}` : "📚 借阅回家"}
          </button>
        {/if}
        </div>
      {/snippet}

      {#if openPurchaseGroup || openFurnitureGroup || (openGroup && groupItems(openGroup).length > 3) || (["cat", "cat_train"].includes(openGroup ?? "") && availableCats.length > 0)}
        <div class="action-grid group-open">
          {#if openPurchaseGroup}
            <div class="purchase-cart-list" role="group" aria-label="选择本次采购商品">
              {#each openPurchaseGroup.actions as action}
                {@const check = actionCheck(action)}
                <label class="purchase-row" class:unavailable={!check.ok} title={!check.ok ? check.reason : undefined}>
                  <input type="checkbox" checked={selectedPurchaseIds.includes(action.id)} disabled={!check.ok} onchange={(event) => setPurchaseSelection(action.id, (event.currentTarget as HTMLInputElement).checked)} />
                  <span class="purchase-copy"><strong>{action.name}</strong><small>{action.desc}</small></span>
                  <b class="purchase-price">¥{formatMoney(purchasePriceOf(gameState, action))}</b>
                </label>
              {/each}
              <div class="purchase-summary">
                <span>已选 {selectedPurchaseActions.length} 件 · 合计 ¥{formatMoney(selectedPurchaseTotal)}</span>
                <small>本次采购耗时 {selectedPurchaseActions.length >= 3 ? "1 小时" : "30 分钟"}</small>
                <button class="purchase-checkout" disabled={!selectedPurchaseCanCheckout} onclick={checkoutPurchaseCart}>
                  {selectedPurchaseActions.length === 0 ? "先选择商品" : selectedPurchaseTotal > gameState.player.money ? "余额不足" : "结算采购"}
                </button>
              </div>
            </div>
          {:else if openFurnitureGroup}
            {#each openFurnitureGroup.actions as action}
              {@render actionCard(action)}
            {/each}
          {:else if openGroup === "cat"}
            <!-- v1.39：未携带但家里有猫时，显示家里的猫，可直接喂食/洗澡/玩耍 -->
            <button class="action-card cat-manage" class:classic-bg={uiState.actionCardBackground === "glass"} style={artStyle("market")} onclick={() => (uiState.modal = "cat")}>
              <div class="action-head">
                <div class="head-right">
                  <span class="tag info">🐱 猫咪面板</span>
                </div>
              </div>
              <div class="action-name">
                {activeCat
                  ? `${activeCat.name} Lv.${activeCat.level}`
                  : availableCats.length > 0
                    ? `家里有 ${availableCats.length} 只猫咪（未携带）`
                    : "还没有猫咪"}
              </div>
              <div class="action-desc">
                {#if activeCat}
                  {@const def = getCatDef(activeCat.catId)}
                  携带中 · {def?.desc ?? ""} 点击打开猫咪面板：切换携带 / 喂食 / 洗澡 / 玩耍
                {:else if availableCats.length > 0}
                  猫咪都在家待着 · 下面的喂食 / 洗澡可直接照顾它们；点击打开猫咪面板可切换携带
                {:else}
                  去宠物用品店领养一只，或在街上碰碰运气；领养后就能在这里照顾它
                {/if}
              </div>
            </button>
            {#each visibleSceneActions.filter((a) => a.group === "cat" && (a.id === "cat_feed" || a.id === "cat_clean")) as action}
              {@render actionCard(action)}
            {/each}
            <!-- v1.39 问题3：原「更多」折叠只露出一个玩耍，其余互动都在猫咪面板，改为直达猫咪面板 -->
            <button class="action-card fold-toggle" class:classic-bg={uiState.actionCardBackground === "glass"} style={artStyle("market")} onclick={() => (uiState.modal = "cat")}>
              <div class="action-head">
                <div class="head-right">
                  <span class="tag info">更多</span>
                </div>
              </div>
              <div class="action-name">更多照顾</div>
              <div class="action-desc">玩耍 / 卡包 / 饰品 / 图鉴 → 打开猫咪面板</div>
            </button>
          {:else}
            {#each visibleSceneActions.filter((a) => a.group === openGroup) as action}
              {@render actionCard(action)}
            {/each}
          {/if}
        </div>
      {/if}

      {#if visibleSceneActions.length || atResidence || (isLibraryLocation(gameState.locationId) || gameState.locationId === "temple")}
        <div class="actions-heading"><span>可选行动</span><small>查看耗时与花费，安排这一刻</small></div>
      {/if}
      <div class="action-grid">
        {#if isLibraryLocation(gameState.locationId)}
          <button class="action-card library-return-card" class:classic-bg={uiState.actionCardBackground === "glass"} style={artStyle("desk")} disabled={!loanedLibraryBook} onclick={returnBorrowedBook}>
            <div class="action-head"><div class="head-right"><span class="tag info">📚 图书馆服务</span></div></div>
            <div class="action-name">归还借阅书籍</div>
            <div class="action-desc">{loanedLibraryBook ? `归还《${loanedLibraryBook.name}》，无需耗时；归还后可以再借一本。` : "当前没有外借书籍。借回家的馆藏也可以在这里归还。"}</div>
          </button>
        {/if}
        {#if gameState.locationId === "temple"}
          <button class="action-card temple-gift-card" class:classic-bg={uiState.actionCardBackground === "glass"} style={artStyle("housing")} onclick={() => (uiState.modal = "temple_gift_shop")}>
            <div class="action-head"><div class="head-right"><span class="tag gain">🛕 免费结缘</span></div></div>
            <div class="action-name">结缘院</div>
            <div class="action-desc">经文小册、素木腕珠与画印，每个游戏周可随喜领取一件。</div>
          </button>
        {/if}
        {#if atResidence}
          <button class="action-card" data-home-trash-flat onclick={showCityTip}><div class="action-head"><span class="tag gain">🗑️ 床边小物</span></div><div class="action-name">床边的垃圾桶</div><div class="action-desc">翻到一张小纸条，看看上面写了什么。</div></button>
          <button class="action-card bookshelf-card" class:classic-bg={uiState.actionCardBackground === "glass"} style={artStyle("housing")} onclick={() => (uiState.modal = "bookshelf")}>
            <div class="action-head"><div class="head-right"><span class="tag gain">📚 居家阅读</span></div></div>
            <div class="action-name">看看书</div>
            <div class="action-desc">查看已经收集的书籍、经文和纪念文书，选择一本继续阅读。</div>
          </button>
        {/if}
        {#if atResidence && availableCats.length > 0}
          <button class="action-card cat-status-card" class:classic-bg={uiState.actionCardBackground === "glass"} style={artStyle("market")} onclick={() => (uiState.modal = "cat")}>
            <div class="action-head"><div class="head-right"><span class="tag gain">🐱 猫咪状态</span></div></div>
            <div class="action-name">{activeCat ? `${activeCat.name} · Lv.${activeCat.level}` : `家中有 ${availableCats.length} 只猫咪`}</div>
            <div class="action-desc">查看饥饿、健康、心情和携带状态，喂食、洗澡、玩耍等操作收纳在猫咪分组中。</div>
          </button>
        {/if}
        {#each visibleSceneActions.filter((a) => !a.group && !groupedPurchaseIds.has(a.id) && !groupedFurnitureIds.has(a.id)&&!groupedRetailIds.has(a.id)) as action}
          {@render actionCard(action)}
        {/each}
        {#each ACTION_GROUPS as g}
          {@const items = groupItems(g.id)}
          {@const petGroupHidden = (g.id === "cat" || g.id === "cat_train") && availableCats.length === 0}
          {@const folded = ["cat", "cat_train"].includes(g.id)}
          {#if !petGroupHidden && items.length > 0 && items.length <= 3 && !folded}
            {#each items as action}
              {@render actionCard(action)}
            {/each}
            {#if g.id === "cook"}
              <button class="action-card cooking-menu-card" class:classic-bg={uiState.actionCardBackground === "glass"} style={artStyle("food")} onclick={openCooking}>
                <div class="action-head"><div class="head-right"><span class="tag gain">🍽️ 自由烹饪</span></div></div>
                <div class="action-name">打开烹饪工作台</div>
                <div class="action-desc">从背包和冰箱选 1–3 份食材，搭配 0–2 种调料，成功菜谱永久解锁。</div>
              </button>
            {/if}
          {/if}
        {/each}
      </div>
    {/if}
  {/if}
    </div>
  {/key}

  {#if foodModal}
    <div class="overlay hud-scope food-overlay" onclick={() => (foodModal = null)}>
      <div class="food-box" onclick={(e) => e.stopPropagation()}>
        <button class="food-close" onclick={() => (foodModal = null)}>✕</button>
        <div class="food-title">🛒 购买猫粮 · {foodModal.item.name}</div>
        <div class="food-sub dim">小包 1 份 / 中包 5 份(九五折) / 大包 25 份(八折)</div>
        <div class="food-opts">
          {#each FOOD_SIZES as sz}
            <button class="food-opt" onclick={() => buyFood(sz)}>
              <span class="fo-label">{CAT_FOOD_SIZE[sz].label}</span>
              <span class="fo-qty">×{CAT_FOOD_SIZE[sz].qty} 份</span>
              <span class="fo-price">💰 {formatMoney(foodPrice(sz))}</span>
            </button>
          {/each}
        </div>
        <button class="food-cancel" onclick={() => (foodModal = null)}>取消</button>
      </div>
    </div>
  {/if}

  {#if stallKitModal}
    <div class="overlay hud-scope food-overlay" onclick={() => (stallKitModal = null)}>
      <div class="food-box stall-kit-box" onclick={(e) => e.stopPropagation()}>
        <button class="food-close" onclick={() => (stallKitModal = null)}>✕</button>
        <div class="food-title">🍱 摆摊食材不齐</div>
        <div class="food-sub dim">当前缺少：{stallKitModal.missing.join("、")}</div>
        <div class="stall-kit-note">可以购买一份临时预制料理包，替代本次摆摊所需食材。购买后立即开始摆摊。</div>
        <button class="food-opt" disabled={gameState.player.money < STALL_PREP_KIT_COST} onclick={buyStallKit}>
          <span class="fo-label">购买预制料理包</span>
          <span class="fo-qty">本次出摊使用</span>
          <span class="fo-price">💰 {formatMoney(STALL_PREP_KIT_COST)}</span>
        </button>
        {#if gameState.player.money < STALL_PREP_KIT_COST}
          <div class="stall-kit-short">现金不足，至少需要 {formatMoney(STALL_PREP_KIT_COST)} 元。</div>
        {/if}
        <button class="food-cancel" onclick={() => (stallKitModal = null)}>取消</button>
      </div>
    </div>
  {/if}

</div>

<style>
  .scene-loading { min-height:180px;display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;padding:24px;color:var(--hud-text); }
  .scene-loading button { border:1px solid var(--hud-border);border-radius:8px;padding:9px 12px;background:var(--hud-surface-solid);color:inherit;font:inherit;cursor:pointer; }
  .scene.home-scene { padding:0;overflow:hidden;min-width:0;border:0;border-radius:0; }
  :global(:root[data-game-mode="mobile"]) .scene.home-scene { padding:0;gap:0; }
  .scene-body.home-body { height:100%;gap:0;min-height:0; }
  .scene {
    color: var(--hud-text);
    flex: 1;
    overflow-y: auto;
    padding: 16px 22px;
    /* keyed 场景切换时让新旧内容占据同一格，交叠期间不挤压页面。 */
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    position: relative;
    /* v0.91 可读性：场景文字统一加深色描边，昼夜背景都清晰 */
    text-shadow: var(--hud-text-shadow);
    /* 供 CityMapView 网格做容器查询降级（三栏布局下宽度会变） */
    container-type: inline-size;
  }
  /* v1.4：车站场景叠加随昼夜变化的氛围层，补足素材色差并让当前时段更直观。 */
  .station-ambient {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    border-radius: inherit;
  }
  .station-ambient.ambient-day {
    background: linear-gradient(135deg, rgba(255, 220, 151, 0.08), transparent 52%, rgba(91, 177, 255, 0.04));
  }
  .station-ambient.ambient-dusk {
    background: linear-gradient(135deg, rgba(123, 83, 170, 0.16), rgba(255, 155, 93, 0.08) 52%, rgba(18, 22, 64, 0.13));
  }
  .station-ambient.ambient-night {
    background: linear-gradient(135deg, rgba(3, 18, 59, 0.24), rgba(18, 24, 62, 0.16) 52%, rgba(2, 7, 24, 0.28));
  }
  .scene-body {
    grid-area: 1 / 1;
    display: flex;
    flex-direction: column;
    gap: 16px;
    flex: 1;
    min-height: 0;
    position: relative;
    z-index: 1;
    min-width: 0;
  }
  .scene-nav-frame {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 14px;
    padding: 6px 8px;
    min-height: 40px;
    border-radius: 9px;
    background: var(--hud-surface-solid);
    border: 1px solid var(--hud-border);
  }
  /* L2 图片地图：把路径与返回操作叠到地图右下角，和地图说明保持同一视觉层。 */
  .scene-body.atlas-nav-overlay > .scene-nav-frame {
    position: absolute;
    right: 22px;
    bottom: 20px;
    z-index: 8;
    width: min(82%, 760px);
    min-height: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
    background: transparent;
    border: 0;
    box-shadow: none;
    pointer-events: none;
  }
  .scene-body.atlas-nav-overlay > .scene-nav-frame .breadcrumbs,
  .scene-body.atlas-nav-overlay > .scene-nav-frame .loc-nav {
    flex: 0 0 auto;
    width: auto;
    max-width: 100%;
    padding: 5px 7px;
    border: 1px solid rgba(211, 195, 154, 0.34);
    border-radius: 10px;
    background: rgba(8, 16, 28, 0.58);
    box-shadow: 0 5px 18px rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(8px);
    pointer-events: auto;
  }
  .scene-body.atlas-nav-overlay > .scene-nav-frame .breadcrumbs {
    overflow-x: auto;
  }
  .scene-body.atlas-nav-overlay > .scene-nav-frame .loc-nav {
    margin-left: 0;
  }
  .scene-nav-frame .breadcrumbs,
  .scene-nav-frame .loc-nav {
    margin: 0;
  }
  .scene-nav-frame .breadcrumbs {
    flex: 1 1 260px;
    min-width: 0;
    flex-wrap: nowrap;
    overflow-x: auto;
    padding: 2px 1px;
    scrollbar-width: thin;
  }
  .scene-nav-frame .loc-nav {
    flex: 0 0 auto;
    margin-left: auto;
  }
  @keyframes sceneEnter {
    from {
      transform: translateY(10px) scale(0.995);
    }
    to {
      transform: translateY(0) scale(1);
    }
  }
  /* v0.935 P1：等待条 / 候场提示 */
  .wait-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 9px;
    background: var(--hud-surface-solid);
    border: 1px solid var(--hud-border);
  }
  .wait-label {
    font-size: 12.5px;
    font-weight: 700;
    color: var(--text-dim);
  }
  .wait-btn {
    font: inherit;
    font-size: 12px;
    padding: 5px 12px;
    border-radius: 6px;
    background: color-mix(in srgb, var(--hud-text) 4%, transparent);
    border: 1px solid var(--hud-border);
    color: var(--text-main);
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
  }
  .wait-btn:hover {
    background: rgba(255, 209, 102, 0.16);
    border-color: var(--accent, #ffd166);
  }
  .wait-btn:active {
    transform: scale(0.95);
  }
  .wait-btn.smart {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    border-color: color-mix(in srgb, var(--accent) 40%, transparent);
    color: var(--accent);
    font-weight: 700;
  }
  .early-banner {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
    padding: 10px 14px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--accent) 12%, var(--hud-surface-solid));
    border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
  }
  .eb-title {
    font-size: 13px;
    font-weight: 800;
    color: var(--accent);
  }
  .eb-text {
    font-size: 12.5px;
    color: var(--text-dim);
  }
  .breadcrumbs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    font-size: 12.5px;
  }
  .crumb {
    padding: 5px 8px;
    border-radius: 5px;
    background: transparent;
    border: 1px solid transparent;
    color: var(--text-dim);
    font-size: 12px;
    cursor: pointer;
    transition: all var(--dur-fast) var(--ease-out);
  }
  .crumb:hover {
    background: rgba(255, 209, 102, 0.12);
    color: var(--accent);
  }
  .crumb:active {
    transform: scale(0.95);
  }
  .crumb.last {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    border-color: transparent;
    color: var(--text-main);
    font-weight: 700;
    cursor: default;
  }
  .crumb:disabled {
    opacity: 1;
  }
  .sep {
    color: var(--text-dim);
    font-size: 14px;
  }
  .loc-nav {
    position: relative;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .flat-home-departure { position: absolute; top: 100%; right: 0; z-index: 40; }
  .loc-chip {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 7px 11px;
    border-radius: 6px;
    background: color-mix(in srgb, var(--hud-text) 5%, transparent);
    border: 1px solid transparent;
    font-size: 13px;
    color: var(--text-dim);
    transition: all var(--dur-fast) var(--ease-out);
  }
  .loc-chip:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--text-main);
  }
  .sleep-chip {
    margin-left: auto;
    background: rgba(123, 216, 143, 0.12);
    color: var(--ok);
    font-weight: 700;
    border: 1px solid rgba(123, 216, 143, 0.3);
  }
  .exit-chip {
    background: color-mix(in srgb, var(--accent-2) 9%, transparent);
    color: var(--accent-2);
    font-weight: 700;
    border: 1px solid color-mix(in srgb, var(--accent-2) 22%, transparent);
  }
  .back-chip {
    background: color-mix(in srgb, var(--accent) 9%, transparent);
    color: var(--accent);
    font-weight: 700;
    border: 1px solid color-mix(in srgb, var(--accent) 22%, transparent);
  }
  .fixed-jobs {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .fj-head {
    font-size: 13px;
    font-weight: 700;
    color: var(--accent);
    letter-spacing: 1px;
  }
  .head-right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .duration {
    background: rgba(108, 198, 255, 0.13);
    color: var(--accent-2);
  }
  .loc-card {
    border-radius: 14px;
    padding: 22px 26px;
    display: flex;
    align-items: center;
    gap: 16px;
    border: 1px solid rgba(229, 234, 220, 0.18);
    box-shadow: 0 7px 22px rgba(3, 17, 19, 0.2);
    position: relative;
    overflow: hidden;
    isolation: isolate;
    flex: 0 0 auto;
    min-height: 112px;
    background: var(--panel-glass-bg);
    -webkit-backdrop-filter: blur(9px);
    backdrop-filter: blur(9px);
  }
  .loc-card::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 0;
    background-image: var(--loc-bg, none);
    background-position: center;
    background-size: cover;
    filter: saturate(0.83) contrast(0.94);
    opacity: 0.9;
  }
  .loc-card::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 0;
    background:
      linear-gradient(90deg, rgba(5, 22, 25, 0.88), rgba(5, 22, 25, 0.38) 60%, rgba(5, 22, 25, 0.16)),
      linear-gradient(0deg, rgba(5, 22, 25, 0.3), transparent 75%);
    pointer-events: none;
  }
  .loc-info {
    position: relative;
    z-index: 1;
  }
  .loc-emoji {
    font-size: 44px;
    filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.35));
  }
  .loc-info {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    width: 100%;
    color: #f4f1e7;
  }
  .loc-eyebrow { color: #d1c7a6; font-size: 9px; letter-spacing: 2px; font-weight: 550; }
  .loc-name {
    font-size: 25px;
    font-weight: 750;
    letter-spacing: 1px;
    overflow-wrap: anywhere;
    text-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
  }
  .loc-desc {
    font-size: 12px;
    line-height: 1.6;
    color: rgba(247, 244, 233, 0.77);
    overflow-wrap: anywhere;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
  }
  @container (max-width: 620px) {
    .scene-body { gap: 10px; }
    .loc-card {
      min-height: 64px;
      padding: 14px 16px;
      gap: 8px;
      border-radius: 14px;
    }
    .loc-name { font-size: 18px; line-height: 1.2; }
    .loc-desc { font-size: 11.5px; line-height: 1.4; }
  }
  .station-timebar {
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding: 11px 13px;
    border-radius: 14px;
    background: var(--hud-surface-solid);
    border: 1px solid var(--hud-border);
  }
  @container (max-width: 620px) {
    .development-preview { padding: 13px 14px; }
  }
  .station-timebar[data-theme="day"] {
    border-color: rgba(255, 209, 102, 0.34);
  }
  .station-timebar[data-theme="dusk"] {
    border-color: rgba(203, 151, 255, 0.4);
  }
  .station-timebar[data-theme="night"] {
    border-color: rgba(108, 198, 255, 0.34);
  }
  .station-timebar-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    color: var(--text-main);
    font-size: 12px;
    font-weight: 800;
  }
  .station-now {
    color: var(--text-dim);
    font-size: 11px;
    font-weight: 600;
  }
  .station-periods {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 7px;
  }
  .station-period {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    padding: 8px 9px;
    border-radius: 9px;
    background: color-mix(in srgb, var(--hud-text) 4%, transparent);
    border: 1px solid var(--hud-border);
    opacity: 0.58;
    transition: opacity var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
  }
  .station-period.active {
    opacity: 1;
    background: rgba(255, 209, 102, 0.16);
    border-color: rgba(255, 209, 102, 0.52);
    box-shadow: 0 0 0 1px rgba(255, 209, 102, 0.08), 0 7px 18px rgba(0, 0, 0, 0.14);
  }
  .station-period-name {
    overflow: hidden;
    color: var(--text-main);
    font-size: 11px;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .station-period-range {
    color: rgba(221, 230, 255, 0.64);
    font-size: 10px;
    white-space: nowrap;
  }
  .action-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(210px, 100%), 1fr));
    gap: 12px;
    margin-top: 0;
    grid-auto-rows: 1fr;
    align-items: stretch;
  }
  .actions-heading { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 4px 10px; margin-bottom: -5px; font-size: 12px; font-weight: 650; color: var(--text-main); letter-spacing: 0.8px; }
  .actions-heading small { font-size: 10px; font-weight: 400; letter-spacing: 0; color: var(--text-dim); }
  .action-card-shell { display: contents; }
  .action-card-shell.borrowable { min-width: 0; display: flex; flex-direction: column; gap: 6px; }
  .action-card-shell.borrowable > .action-card { flex: 1; width: 100%; }
  .borrow-book-button {
    min-height: 34px;
    padding: 7px 10px;
    border: 1px solid rgba(255, 209, 102, 0.46);
    border-radius: 10px;
    color: #ffe5a1;
    background: rgba(255, 209, 102, 0.12);
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
  }
  .borrow-book-button:hover:not(:disabled) { background: rgba(255, 209, 102, 0.22); border-color: var(--accent, #ffd166); }
  .borrow-book-button:disabled { color: rgba(235, 222, 188, 0.62); border-color: rgba(255, 255, 255, 0.15); background: rgba(255, 255, 255, 0.04); cursor: not-allowed; }
  .group-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 10px;
    margin-top: 10px;
  }
  .cat-group-entry {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 7px;
    min-width: 0;
  }
  .cat-carry-quick {
    min-width: 58px;
    padding: 0 10px;
    border: 1px solid rgba(255, 209, 102, 0.52);
    border-radius: 12px;
    background: rgba(255, 209, 102, 0.15);
    color: #ffe7a8;
    font: inherit;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
  }
  .cat-carry-quick:hover { background: rgba(255, 209, 102, 0.27); }
  .cat-carry-quick:active { transform: scale(0.96); }
  .group-card {
    position: relative;
    overflow: hidden;
    isolation: isolate;
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-width: 0;
    min-height: 64px;
    padding: 12px 14px;
    border-radius: 10px;
    background: var(--hud-surface-solid);
    border: 1px solid var(--hud-border);
    color: var(--text-main);
    font-size: 13px;
    font-weight: 650;
    text-align: left;
    cursor: pointer;
    transition: transform var(--dur-fast) var(--ease-out);
  }
  .group-card::before,
  .facility-card::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 0;
    background-image: var(--action-bg, none);
    background-position: center;
    background-size: cover;
    filter: saturate(0.65) contrast(0.86);
    opacity: 0.38;
    transition: transform var(--dur-fast) var(--ease-out), opacity var(--dur-fast) var(--ease-out);
  }
  .group-card::after,
  .facility-card::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 0;
    background: linear-gradient(100deg, var(--hud-surface-solid), color-mix(in srgb, var(--hud-surface-solid) 85%, transparent) 65%, color-mix(in srgb, var(--hud-surface-solid) 65%, transparent));
    pointer-events: none;
  }
  .group-card > *,
  .facility-card > * {
    position: relative;
    z-index: 1;
  }
  /* v1.4：允许用户切回原先的半透明玻璃底纹。 */
  .group-card.classic-bg,
  .facility-card.classic-bg,
  .small-pet-row.classic-bg {
    background: var(--panel-glass-bg, var(--glass-bg, rgba(7, 12, 24, 0.68)));
  }
  .group-card.classic-bg::before,
  .facility-card.classic-bg::before,
  .small-pet-row.classic-bg::before {
    opacity: 0;
    transform: none;
  }
  .group-card.classic-bg::after,
  .facility-card.classic-bg::after,
  .small-pet-row.classic-bg::after {
    background: color-mix(in srgb, var(--hud-surface-solid) 55%, transparent);
  }
  .group-card:hover {
    transform: translateY(-2px);
  }
  .group-card:hover::before,
  .facility-card:hover::before {
    opacity: 0.6;
    transform: scale(1.04);
  }
  .group-card:active {
    transform: scale(0.97);
  }
  .group-card.open {
    background: color-mix(in srgb, var(--accent) 12%, var(--hud-surface-solid));
    border-color: color-mix(in srgb, var(--accent) 50%, transparent);
  }
  .group-icon {
    font-size: 22px;
    flex: 0 0 auto;
  }
  .group-copy {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .group-desc {
    overflow: hidden;
    color: var(--text-dim);
    font-size: 10px;
    font-weight: 500;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .purchase-group-card {
    border-color: color-mix(in srgb, var(--ok) 24%, var(--hud-border));
    background: var(--hud-surface-solid);
  }
  .purchase-group-card.open {
    border-color: color-mix(in srgb, var(--ok) 60%, transparent);
    background: color-mix(in srgb, var(--ok) 12%, var(--hud-surface-solid));
  }
  .group-count {
    margin-left: auto;
    font-size: 11px;
    font-weight: 600;
  }
  .flower-facilities {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 10px;
    padding: 13px 14px;
    border-radius: 11px;
    background: var(--hud-surface-solid);
    border: 1px solid var(--hud-border);
  }
  .flower-facilities-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    font-size: 13px;
    font-weight: 800;
    color: var(--ok);
  }
  .flower-facilities-head .dim {
    font-size: 11px;
    font-weight: 500;
  }
  .flower-facilities-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .facility-card {
    position: relative;
    overflow: hidden;
    isolation: isolate;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    min-width: 0;
    min-height: 78px;
    padding: 12px 13px;
    border-radius: 12px;
    color: inherit;
    text-align: left;
    font: inherit;
    cursor: pointer;
    transition: transform var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
  }
  .facility-card:hover {
    transform: translateY(-2px);
  }
  .pet-shop-facility {
    background: var(--hud-surface-solid);
    border: 1px solid color-mix(in srgb, var(--accent-2) 30%, transparent);
  }
  .pet-shop-facility:hover {
    background: color-mix(in srgb, var(--accent-2) 12%, var(--hud-surface-solid));
    border-color: var(--accent-2);
  }
  .pet-hospital-facility {
    background: var(--hud-surface-solid);
    border: 1px solid color-mix(in srgb, var(--warn) 30%, transparent);
  }
  .pet-hospital-facility:hover {
    background: color-mix(in srgb, var(--warn) 12%, var(--hud-surface-solid));
    border-color: var(--warn);
  }
  .facility-icon {
    display: none;
  }
  .facility-copy {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .facility-name {
    font-size: 14px;
    font-weight: 800;
  }
  .facility-desc {
    color: var(--text-dim);
    font-size: 11px;
    line-height: 1.45;
  }
  .facility-arrow {
    color: var(--text-dim);
    font-size: 20px;
  }
  .flower-facility-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 10px;
    padding: 9px 11px;
    border-radius: 12px;
    background: var(--hud-surface-solid);
    border: 1px solid var(--hud-border);
    font-size: 13px;
  }
  .facility-back {
    padding: 6px 10px;
    border-radius: 999px;
    border: 1px solid rgba(255, 209, 102, 0.38);
    background: rgba(255, 209, 102, 0.12);
    color: var(--accent);
    font: inherit;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
  }
  @container (max-width: 620px) {
    .flower-facilities-head,
    .flower-facility-nav {
      align-items: flex-start;
      flex-direction: column;
    }
    .flower-facilities-grid {
      grid-template-columns: 1fr;
    }
  }
  @container (max-width: 520px) {
    .station-periods {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  .group-open {
    border-top: 1px solid var(--hud-border);
    padding-top: 12px;
    animation: groupOpen var(--dur-fast) var(--ease-out);
  }
  .purchase-cart-list {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  .purchase-row {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    min-width: 0;
    padding: 10px 12px;
    border: 1px solid var(--hud-border);
    border-radius: 10px;
    background: var(--hud-surface-solid);
    cursor: pointer;
  }
  .purchase-row.unavailable { opacity: 0.55; cursor: not-allowed; }
  .purchase-row input { width: 19px; height: 19px; accent-color: var(--ok); }
  .purchase-copy { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .purchase-copy strong { font-size: 14px; font-weight: 800; }
  .purchase-copy small { color: var(--text-dim); font-size: 12px; line-height: 1.45; }
  .purchase-price { color: var(--warn, #ffb347); white-space: nowrap; }
  .purchase-summary {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 3px 12px;
    padding: 12px;
    border: 1px solid color-mix(in srgb, var(--ok) 34%, var(--hud-border));
    border-radius: 10px;
    background: color-mix(in srgb, var(--ok) 8%, var(--hud-surface-solid));
    font-weight: 750;
  }
  .purchase-summary small { color: var(--text-dim); font-size: 12px; font-weight: 500; }
  .purchase-checkout {
    grid-column: 2;
    grid-row: 1 / span 2;
    min-width: 112px;
    min-height: 44px;
    border: 1px solid color-mix(in srgb, var(--ok) 55%, var(--hud-border));
    border-radius: 9px;
    background: color-mix(in srgb, var(--ok) 18%, var(--hud-surface-solid));
    color: var(--hud-text);
    font: inherit;
    font-weight: 800;
  }
  .purchase-checkout:disabled { opacity: 0.48; cursor: not-allowed; }
  @container (max-width: 520px) {
    .purchase-row { grid-template-columns: 22px minmax(0, 1fr); }
    .purchase-price { grid-column: 2; }
    .purchase-summary { grid-template-columns: 1fr; }
    .purchase-checkout { grid-column: 1; grid-row: auto; width: 100%; }
  }
  .cooking-menu-card {
    border-color: rgba(255, 209, 102, 0.34);
    background: linear-gradient(145deg, rgba(255, 209, 102, 0.1), rgba(12, 19, 36, 0.62));
  }
  .cooking-menu-card:hover:not(.disabled) {
    border-color: rgba(255, 209, 102, 0.62);
  }
  @keyframes groupOpen {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  /* v1.32 家里猫咪分组：管理入口卡（打开猫咪面板 / 切换携带） */
  .cat-manage {
    background: linear-gradient(145deg, rgba(255, 209, 102, 0.1), rgba(255, 209, 102, 0.02));
    border-color: rgba(255, 209, 102, 0.35);
  }
  .cat-manage:hover:not(.disabled) {
    border-color: var(--accent);
    box-shadow: 0 6px 20px rgba(255, 209, 102, 0.12);
  }
  /* v1.39 猫咪分组「更多」直达猫咪面板按钮 */
  .fold-toggle {
    align-items: flex-start;
    background: rgba(255, 255, 255, 0.03);
    border-style: dashed;
    opacity: 0.85;
  }
  /* v1.3b4：三级（地点）操作面板由纯色底纹改为磨砂玻璃，与一二级地图玻璃统一 */
  .action-card {
    position: relative;
    overflow: hidden;
    isolation: isolate;
    text-align: left;
    background: var(--hud-surface-solid);
    -webkit-backdrop-filter: blur(10px);
    backdrop-filter: blur(10px);
    border: 1px solid var(--hud-border);
    border-radius: 11px;
    padding: 17px 18px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 132px;
    color: var(--text-main);
    box-shadow: 0 3px 10px rgba(3, 17, 19, 0.12);
    transition: transform var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
    animation: cardStaggerIn var(--dur-fast) var(--ease-out) both;
  }
  .action-card::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 0;
    background-image: var(--action-bg, none);
    background-position: right center;
    background-size: cover;
    filter: saturate(0.65) contrast(0.9);
    opacity: 0.5;
    transition: transform var(--dur-fast) var(--ease-out), opacity var(--dur-fast) var(--ease-out), filter var(--dur-fast) var(--ease-out);
  }
  .action-card::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 0;
    background:
      linear-gradient(100deg, var(--hud-surface-solid), color-mix(in srgb, var(--hud-surface-solid) 88%, transparent) 54%, color-mix(in srgb, var(--hud-surface-solid) 60%, transparent));
    pointer-events: none;
  }
  .action-card > * {
    position: relative;
    z-index: 1;
  }
  .action-card.classic-bg {
    background: var(--panel-glass-bg, var(--glass-bg, rgba(7, 12, 24, 0.68)));
  }
  .action-card.classic-bg::before {
    opacity: 0;
    transform: none;
  }
  .action-card.classic-bg::after {
    background: color-mix(in srgb, var(--hud-surface-solid) 65%, transparent);
  }
  @keyframes cardStaggerIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: none; }
  }
  .action-card:hover:not(.disabled) {
    border-color: color-mix(in srgb, var(--accent) 65%, transparent);
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(3, 17, 19, 0.23);
  }
  .action-card:hover:not(.disabled)::before {
    opacity: 0.65;
    transform: scale(1.035);
  }
  .action-card:active:not(.disabled) {
    transform: scale(0.97);
  }
  .action-card.disabled {
    opacity: 0.68;
    cursor: not-allowed;
  }
  .action-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    order: 2;
    margin-top: 3px;
    padding-top: 8px;
    border-top: 1px solid color-mix(in srgb, var(--hud-text) 7%, transparent);
  }
  .action-icon {
    font-size: 26px;
  }
  .tags {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .action-name {
    font-size: 15px;
    line-height: 1.4;
    font-weight: 750;
    order: 0;
  }
  .action-desc {
    font-size: 12px;
    color: var(--text-dim);
    line-height: 1.65;
    flex: 1;
    order: 1;
  }
  .action-lock {
    font-size: 11px;
    color: var(--warn);
    order: 3;
    line-height: 1.5;
  }
  .proj-bar-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 2px;
    order: 3;
  }
  .proj-bar {
    flex: 1;
    height: 6px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
    overflow: hidden;
  }
  .proj-bar.done .proj-fill {
    background: var(--ok, #7bd88f);
  }
  .proj-fill {
    height: 100%;
    border-radius: 999px;
    background: var(--accent, #ffd166);
    transition: width var(--dur-base) var(--ease-out);
  }
  .proj-pct {
    font-size: 11px;
    color: var(--text-dim);
    white-space: nowrap;
  }
  /* v1.3b3 在场 NPC 面板 */
  .npc-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    border-radius: 11px;
    background: var(--hud-surface-solid);
    -webkit-backdrop-filter: blur(10px) saturate(1.08);
    backdrop-filter: blur(10px) saturate(1.08);
    border: 1px solid var(--hud-border);
  }
  .npc-panel-head {
    font-size: 13px;
    font-weight: 700;
    color: var(--accent);
    letter-spacing: 1px;
  }
  .npc-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--hud-text) 3%, transparent);
  }
  :global(.portrait-stack[data-portrait-class~="npc-card-portrait"]) {
    width: 42px;
    height: 56px;
    flex: 0 0 42px;
    border-radius: 9px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
  }
  :global(.portrait-stack[data-portrait-class~="npc-card-portrait"] .portrait-stack-image) {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top center;
  }
  /* 场景卡片没有对话框的左右定位规则，沿用 NPC 立绘的朝向标记直接翻转整组图层。 */
  :global(.portrait-stack.portrait-flipped[data-portrait-class~="npc-card-portrait"]) {
    transform: scaleX(-1);
  }
  .npc-row-ic {
    font-size: 26px;
  }
  .npc-row-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .npc-row-name {
    font-size: 14px;
    font-weight: 700;
  }
  .npc-row-badge {
    font-size: 11px;
    font-weight: 700;
    color: var(--accent);
  }
  .npc-row-badge.formal-ready { color: var(--ok); }
  .npc-row-badge.stranger {
    color: var(--text-dim);
  }
  .npc-row-badges {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .npc-row-btn {
    font: inherit;
    font-size: 12.5px;
    font-weight: 700;
    padding: 7px 14px;
    border-radius: 7px;
    background: color-mix(in srgb, var(--accent-2) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent-2) 30%, transparent);
    color: var(--accent-2);
    cursor: pointer;
    white-space: nowrap;
    transition: background var(--dur-fast) var(--ease-out);
  }
  .npc-row-btn:hover {
    background: rgba(108, 198, 255, 0.28);
  }
  .npc-row-btn:active {
    transform: scale(0.95);
  }
  .npc-row-btn.meet {
    background: rgba(255, 209, 102, 0.16);
    border-color: rgba(255, 209, 102, 0.45);
    color: var(--accent);
  }
  .npc-row-btn.meet:hover {
    background: rgba(255, 209, 102, 0.28);
  }

  /* v1.4 花鸟市场：轻量小宠物照料区 */
  .small-pets-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 14px;
    background: var(--panel-glass-bg);
    -webkit-backdrop-filter: blur(10px) saturate(1.08);
    backdrop-filter: blur(10px) saturate(1.08);
    border: 1px solid rgba(255, 209, 102, 0.24);
  }
  .small-pets-head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 13px;
    font-weight: 700;
    color: var(--accent);
  }
  .small-pets-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .small-pet-row {
    position: relative;
    overflow: hidden;
    isolation: isolate;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 9px 10px;
    border-radius: 10px;
    background: var(--hud-surface-solid);
    border: 1px solid var(--hud-border);
  }
  .small-pet-row::before,
  .small-pet-row::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
  }
  .small-pet-row::before {
    background-image: var(--action-bg, none);
    background-position: center;
    background-size: cover;
    filter: saturate(0.8) contrast(0.86);
    opacity: 0.42;
  }
  .small-pet-row::after {
    background: linear-gradient(100deg, var(--hud-surface-solid), color-mix(in srgb, var(--hud-surface-solid) 85%, transparent) 58%, color-mix(in srgb, var(--hud-surface-solid) 70%, transparent));
  }
  .small-pet-row > * {
    position: relative;
    z-index: 1;
  }
  .small-pet-info {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
  }
  .small-pet-icon {
    position: relative;
    width: 28px;
    height: 28px;
    flex: 0 0 auto;
    border-radius: 50% 44% 52% 40%;
    background: linear-gradient(145deg, rgba(255, 209, 102, 0.92), rgba(108, 198, 255, 0.74));
    box-shadow: 0 0 12px rgba(255, 209, 102, 0.2), inset 2px 1px 0 rgba(255, 255, 255, 0.45);
    transform: rotate(-12deg);
  }
  .small-pet-icon::after {
    content: "";
    position: absolute;
    width: 12px;
    height: 7px;
    left: 8px;
    top: 10px;
    border: 2px solid rgba(5, 16, 35, 0.48);
    border-top: 0;
    border-radius: 0 0 10px 10px;
  }
  .small-pet-icon[data-kind="goldfish"] {
    border-radius: 54% 46% 48% 55%;
    background: linear-gradient(145deg, rgba(255, 159, 104, 0.94), rgba(255, 209, 102, 0.7));
    transform: rotate(8deg);
  }
  .small-pet-icon[data-kind="goldfish"]::after {
    width: 6px;
    height: 6px;
    left: 7px;
    top: 9px;
    border: 0;
    border-radius: 50%;
    background: rgba(5, 16, 35, 0.5);
    box-shadow: 10px 1px 0 rgba(5, 16, 35, 0.34);
  }
  .small-pet-name { font-size: 14px; font-weight: 700; }
  .small-pet-stats { margin-top: 2px; font-size: 11px; color: var(--text-dim); }
  .small-pet-actions { display: flex; gap: 5px; flex-wrap: wrap; justify-content: flex-end; }
  .mini-btn {
    padding: 6px 9px;
    border-radius: 999px;
    border: 1px solid rgba(108, 198, 255, 0.35);
    background: rgba(108, 198, 255, 0.12);
    color: var(--text-main);
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }
  .mini-btn:hover:not(:disabled) { background: rgba(108, 198, 255, 0.24); }
  .mini-btn:disabled { opacity: 0.45; cursor: not-allowed; }

  /* v1.38 P9 猫粮规格选择弹窗 */
  .food-overlay {
    position: fixed;
    inset: 0;
    background: rgba(8, 10, 18, 0.7);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 130;
    animation: fadeIn var(--dur-base) var(--ease-out);
  }
  .food-box {
    width: 360px;
    max-width: calc(100vw - 32px);
    background: var(--bg-card, #181d33);
    border: 1px solid var(--border, #2a3050);
    border-radius: 16px;
    padding: 18px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
    display: flex;
    flex-direction: column;
    gap: 12px;
    position: relative;
    animation: fadeIn var(--dur-base) var(--ease-out);
  }
  .food-close {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    border: none;
    font-size: 14px;
    color: var(--text-dim, #9aa3c7);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .food-close:hover {
    background: rgba(255, 255, 255, 0.2);
    color: #fff;
  }
  .food-title {
    font-size: 16px;
    font-weight: 800;
  }
  .food-sub {
    font-size: 12px;
  }
  .food-opts {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .food-opt {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 12px;
    background: rgba(255, 209, 102, 0.1);
    border: 1px solid rgba(255, 209, 102, 0.35);
    color: var(--text-main);
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    transition: all var(--dur-fast) var(--ease-out);
  }
  .food-opt:hover {
    background: rgba(255, 209, 102, 0.22);
  }
  .food-opt:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .food-opt:disabled:hover {
    background: rgba(255, 209, 102, 0.1);
  }
  .fo-label {
    font-size: 15px;
  }
  .fo-qty {
    color: var(--text-dim, #9aa3c7);
    font-size: 12px;
  }
  .fo-price {
    margin-left: auto;
    color: var(--accent, #ffd166);
    font-weight: 800;
  }
  .food-cancel {
    padding: 8px 0;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid var(--border, #2a3050);
    color: var(--text-dim, #9aa3c7);
    font-size: 13px;
    cursor: pointer;
  }
  .stall-kit-box { width: 390px; }
  .stall-kit-note {
    font-size: 13px;
    line-height: 1.6;
    color: var(--text-main);
  }
  .stall-kit-short {
    color: var(--danger);
    font-size: 12px;
    margin-top: -4px;
  }

  /* v1.43 修复：地图态精简状态条（饱食 / 精力 / 心情 三项核心数值）。
     跟随 hud-scope 风格，置于地图工具栏附近，不遮挡地图交互。 */
  .map-survival-strip {
    display: flex;
    gap: 10px;
    padding: 7px 10px;
    width: 360px;
    max-width: 100%;
    box-sizing: border-box;
    flex: 0 0 auto;
    align-self: center;
    margin-left: auto;
    border-radius: 8px;
    background: var(--hud-surface-solid);
    border: 1px solid var(--hud-border);
  }
  .scene-body.atlas-nav-overlay > .map-survival-strip { position:absolute; top:12px; right:16px; z-index:8; }
  .scene-nav-frame .breadcrumbs { flex: 1 1 0; }
  .map-survival-strip .ms-cell {
    display: flex;
    align-items: center;
    gap: 7px;
    flex: 1 1 0;
    min-width: 0;
  }
  .ms-name {
    font-size: 12px;
    font-weight: 700;
    color: var(--text-dim);
    white-space: nowrap;
    flex: 0 0 auto;
  }
  .ms-track {
    flex: 1 1 auto;
    min-width: 0;
    height: 5px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--hud-text) 10%, transparent);
    overflow: hidden;
  }
  .ms-fill {
    display: block;
    height: 100%;
    border-radius: 999px;
    transition: width var(--dur-base) var(--ease-out);
  }
  .ms-val {
    font-size: 12px;
    font-weight: 700;
    color: var(--text-main);
    min-width: 24px;
    text-align: right;
    flex: 0 0 auto;
  }
  .ms-cell.ms-warn .ms-name,
  .ms-cell.ms-warn .ms-val { color: var(--warn, #ffb347); }
  .ms-cell.ms-danger .ms-name,
  .ms-cell.ms-danger .ms-val { color: var(--danger, #ff6b6b); }
  @container (max-width: 520px) {
    .map-survival-strip { gap: 6px; padding: 6px 8px; }
    .ms-name { font-size: 11px; }
    .ms-val { font-size: 11px; min-width: 20px; }
  }
</style>
