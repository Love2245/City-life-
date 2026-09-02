#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v1.3b3：给指定 NPC 注入网名/网络头像/分层对话（幂等，不覆盖已有字段）。"""
import json, sys, os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH = os.path.join(BASE, "src", "game", "data", "npcs.json")

ADD = {
    "npc_lin_xiaoyu": {
        "netName": "拿铁不加糖",
        "netAvatar": "🎨",
        "talk": {
            "acquaintance": {
                "text": "林小雨端着杯子看你：『又来啦？坐窗边那个老位置？』",
                "options": [
                    {"label": "对啊，这儿安静", "affinity": 3, "log": "你们聊了聊咖啡馆的常客。"},
                    {"label": "随便坐坐", "affinity": 1, "log": "你冲她笑了笑。"},
                ],
            },
            "friend": {
                "text": "林小雨：『我老板缺个临时美工，要不要我帮你问问？』",
                "options": [
                    {"label": "太好了，帮我留意", "affinity": 4, "help": {"log": "林小雨记下了你的联系方式，说有活第一时间找你。", "reward": {"mood": 3}}},
                    {"label": "不用了，我自己来", "affinity": -2, "log": "你婉拒了她的好意。"},
                ],
            },
            "close_friend": {
                "text": "林小雨：『有个社区墙绘的活儿，工期一周，报酬不错，你接不接？』",
                "options": [
                    {"label": "接！什么时候开始", "affinity": 5, "commission": {"title": "社区墙绘兼职", "desc": "帮林小雨的朋友完成一面社区墙绘，约 5 天。", "days": 5, "reward": {"money": 220, "charm": 3}, "rewardText": "+220 元 +3 魅力"}},
                    {"label": "最近太忙了", "affinity": -1, "log": "你表示这阵子抽不出空。"},
                ],
            },
        },
    },
    "npc_zhao_gang": {
        "netName": "老炮儿刚子",
        "netAvatar": "🍺",
        "talk": {
            "acquaintance": {
                "text": "赵刚拍你肩膀：『哟，又来觅活儿啦？』",
                "options": [
                    {"label": "刚哥帮忙留意着", "affinity": 3, "log": "赵刚说有日结的活儿第一个喊你。"},
                    {"label": "随便转转", "affinity": 1, "log": "你在劳务市场溜达了一圈。"},
                ],
            },
            "friend": {
                "text": "赵刚：『仓库那边缺个搬货的，今儿就能上，去不去？』",
                "options": [
                    {"label": "去！带我一个", "affinity": 4, "help": {"log": "赵刚把你推荐给了仓库主管，当场结了半天工钱。", "reward": {"money": 80, "stamina": -10}}},
                    {"label": "今天歇歇", "affinity": -1, "log": "你今天想歇着，赵刚咧嘴一笑。"},
                ],
            },
            "close_friend": {
                "text": "赵刚：『城东有个装修队长期缺人，活儿糙但钱实在，干不干？』",
                "options": [
                    {"label": "干！多长工期", "affinity": 5, "commission": {"title": "装修队长期帮工", "desc": "跟着赵刚的装修队干一阵子，约 6 天。", "days": 6, "reward": {"money": 360, "fitness": 2}, "rewardText": "+360 元 +2 体力上限"}},
                    {"label": "我再想想", "affinity": -1, "log": "你说考虑考虑，赵刚点点头。"},
                ],
            },
        },
    },
    "npc_chen_jie": {
        "netName": "掌勺陈姐",
        "netAvatar": "🍳",
        "talk": {
            "acquaintance": {
                "text": "陈姐：『又来啦？今天想吃点啥？』",
                "options": [
                    {"label": "陈姐推荐个菜", "affinity": 3, "help": {"log": "陈姐给你加了份招牌红烧肉，不要钱。", "reward": {"satiety": 20, "money": -0}}},
                    {"label": "老三样就行", "affinity": 1, "log": "你照旧点了对胃口的。"},
                ],
            },
            "friend": {
                "text": "陈姐：『后厨缺个帮切菜的，笨点没事，来搭把手？』",
                "options": [
                    {"label": "成，我帮你切", "affinity": 4, "help": {"log": "你帮陈姐备了半天菜，她塞给你一份盒饭和工钱。", "reward": {"satiety": 15, "money": 30}}},
                    {"label": "我手笨算了", "affinity": -1, "log": "你摆摆手，陈姐笑了笑。"},
                ],
            },
            "close_friend": {
                "text": "陈姐：『店里想推外卖，你脑子活，帮我想想菜单呗？』",
                "options": [
                    {"label": "包在我身上", "affinity": 5, "commission": {"title": "帮快餐店排外卖菜单", "desc": "帮陈姐设计一周外卖套餐，约 4 天。", "days": 4, "reward": {"money": 160, "charm": 2}, "rewardText": "+160 元 +2 魅力"}},
                    {"label": "这我不在行", "affinity": -1, "log": "你直说不太懂餐饮，陈姐理解。"},
                ],
            },
        },
    },
    "npc_netbar_boss": {
        "netName": "深夜在线",
        "netAvatar": "🕹️",
        "talk": {
            "acquaintance": {
                "text": "网吧老板抬头：『卡密还是老位置？』",
                "options": [
                    {"label": "对，老位置", "affinity": 3, "log": "老板给你留了靠窗的机子。"},
                    {"label": "随便找台", "affinity": 1, "log": "你随便开了台机器。"},
                ],
            },
            "friend": {
                "text": "网吧老板：『常来也不容易，我这有张闲置的会员卡，先借你刷着。』",
                "options": [
                    {"label": "谢了老板！", "affinity": 4, "help": {"log": "网吧老板送你一张免费上网券，今儿网费免了。", "reward": {"mood": 4}}},
                    {"label": "不用这么客气", "affinity": -1, "log": "你推辞了，老板也没勉强。"},
                ],
            },
            "close_friend": {
                "text": "网吧老板：『店里的机器老卡，你会弄电脑，帮我重装几台呗？』",
                "options": [
                    {"label": "没问题，交给我", "affinity": 5, "commission": {"title": "给网吧重装系统", "desc": "帮网吧老板重装并优化几台机器，约 3 天。", "days": 3, "reward": {"money": 200, "intelligence": 2}, "rewardText": "+200 元 +2 智力"}},
                    {"label": "我不太会装系统", "affinity": -1, "log": "你老实说不太擅长，老板笑笑说没事。"},
                ],
            },
        },
    },
    "npc_librarian": {
        "netName": "书页之间",
        "netAvatar": "📚",
        "talk": {
            "acquaintance": {
                "text": "图书馆大姐：『又来借书啦？这次想看什么？』",
                "options": [
                    {"label": "想看点实用的", "affinity": 3, "log": "大姐给你荐了本技能书。"},
                    {"label": "随便翻翻", "affinity": 1, "log": "你在书架间慢慢踱步。"},
                ],
            },
            "friend": {
                "text": "图书馆大姐：『馆里要整理一批旧书，缺个帮手，来不？』",
                "options": [
                    {"label": "我来帮忙", "affinity": 4, "help": {"log": "你帮大姐归整了半天书架，她送你一张借书卡。", "reward": {"intelligence": 1, "mood": 2}}},
                    {"label": "今天先不啦", "affinity": -1, "log": "你今天想自己看书，大姐理解。"},
                ],
            },
            "close_friend": {
                "text": "图书馆大姐：『社区要办读书会，你文笔好，帮写几篇推文行不？』",
                "options": [
                    {"label": "乐意之至", "affinity": 5, "commission": {"title": "社区读书会推文", "desc": "帮图书馆大姐写几篇读书会推文，约 4 天。", "days": 4, "reward": {"money": 140, "charm": 2}, "rewardText": "+140 元 +2 魅力"}},
                    {"label": "我写不太好", "affinity": -1, "log": "你谦称笔头不行，大姐说下次也行。"},
                ],
            },
        },
    },
}


def main():
    with open(PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    changed = 0
    for npc in data:
        add = ADD.get(npc.get("id"))
        if not add:
            continue
        for k, v in add.items():
            if k not in npc:  # 幂等：不覆盖已有值
                npc[k] = v
                changed += 1
    with open(PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"OK: injected fields for {len(ADD)} NPCs, {changed} new fields written")


if __name__ == "__main__":
    main()
