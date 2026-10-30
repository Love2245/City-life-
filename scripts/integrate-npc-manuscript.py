"""Merge the reviewed twelve-person manuscript with the existing E/S stories.

Inputs are explicit snapshots so rerunning this cannot accidentally merge a
previously merged document back into itself. The supplied literary draft is
never modified. User corrections are applied only to the runtime manuscript.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re


def sections(text):
    marks = list(re.finditer(r"^# \d+．.+?（(npc_[^）]+)）[^\n]*", text, re.M))
    result = {}
    for i, mark in enumerate(marks):
        end = marks[i + 1].start() if i + 1 < len(marks) else len(text)
        boundary = re.search(r"^# (?!\d+．)", text[mark.end():end], re.M)
        if boundary:
            end = mark.end() + boundary.start()
        result[mark[1]] = (mark.start(), end, text[mark.start():end])
    return result


def scene_bodies(chunk):
    marks = list(re.finditer(r"^(?:### ([DTE]\d+)｜[^\n]+|\*\*(S\d+)｜[^\n]+?\*\*)", chunk, re.M))
    out = {}
    meet = re.search(r"^## 初见\s*\n(.*?)(?=^## |\Z)", chunk, re.M | re.S)
    if meet:
        out['meet'] = meet[1]
    for i, mark in enumerate(marks):
        end = marks[i + 1].start() if i + 1 < len(marks) else len(chunk)
        body = chunk[mark.end():end]
        body = re.split(r"^## |^---", body, flags=re.M)[0]
        out[mark[1] or mark[2]] = body
    return out


def visible_body(body):
    # Authored scheduling/relationship notes are metadata, not changed dialogue.
    return '\n'.join(line.rstrip() for line in body.splitlines()
                     if line.strip() and not line.startswith('**')).strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True)
    parser.add_argument('--legacy', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--report', required=True)
    args = parser.parse_args()
    input_bytes = Path(args.source).read_bytes()
    source = input_bytes.decode('utf-8-sig').replace('\r\n', '\n')
    legacy = Path(args.legacy).read_text(encoding='utf-8-sig').replace('\r\n', '\n')
    old_sections = sections(legacy)
    assert len(old_sections) == 9

    # 2026-10-16：保留双胞胎设定，明确柯杰为哥哥、珂汐为妹妹。
    source = source.replace('哥哥和姐姐', '兄妹介绍').replace('还有，我是姐姐。', '我是他妹妹。')
    source = source.replace('不裁定出生先后。他自称哥哥，她自称姐姐。', '柯杰是哥哥，珂汐是妹妹。')
    source = source.replace('能替所有人安排妥当的姐姐', '能替所有人安排妥当的人')
    source = source.replace('我俩双胞胎，她每次介绍都得把这个纠正一遍。', '我俩双胞胎，我比她早一点。这个哥哥可不是白叫的。')
    source = source.replace('范珂汐：你每次都先说。', '范珂汐：你先让人把名字说完。')

    source = source.replace('共253个场景单元', '合并后共298个场景单元')
    source = source.replace('原来的36场连续故事与24段“故事之后”已拆成独立T闲谈，不预写歌曲完成、投稿、开店、出版或人物分歧得到解决的主线结果。',
                            '原九人的27场E成长故事与18段S后续故事继续保留，沿用原有完成记录；新增T话题独立选择，不推进这些故事。')
    source = source.replace('随后在清吧由范珂汐与杰克接上第二次认识', '随后当天可在清吧由范柯杰与杰克接上第二次认识；范珂汐已经回去')
    source = source.replace('M02由范珂汐与杰克共同出场，迟到、买小吃和向杰克引见玩家的人都是范珂汐。范柯杰不在M02现场接替她说话。',
                            'M02由范柯杰与杰克共同出场，范珂汐已经回去；迟到、买小吃和向杰克引见玩家的人都是范柯杰。两场可在同一天完成。')
    start = source.index('## M02｜')
    end = source.index('## 开场与常规出场的边界', start)
    m2 = source[start:end].replace('每天18:10—22:10', '清吧营业时间18:00至次日06:00')
    m2 = m2.replace('范珂汐', '范柯杰').replace('珂汐', '柯杰')
    m2 = m2.replace('玩家后来主动进入清吧', '玩家完成M01后主动进入清吧，同一天即可触发')
    m2 = m2.replace('他看向的是她。', '他看向的是柯杰。')
    m2 = m2.replace('（她晃了晃纸袋。', '（柯杰晃了晃纸袋。')
    m2 = m2.replace('你先别不高兴，没让你白等。', '别急，没让你白等。你先闻闻这个。')
    m2 = m2.replace('范柯杰：（认出你，往旁边让了让。）是你啊。介绍一下，这位就是在夜市卖笔时遇见的——',
                    '范柯杰：（认出你，往旁边让了让。）来得挺快啊。我妹先回去了。介绍一下，这位就是刚才在小吃街被我拦下来买笔的——')
    m2 = m2.replace('范柯杰：（看着他，笑了一下。）行，你接着说。', '范柯杰：（笑着摊手。）行，练过的先说。我今天已经说够多了。')
    m2 = m2.replace('很好，这次不用柯杰替我们讲。他介绍人总想顺便介绍自己。', '很好，这次我自己讲完了。柯杰介绍人，总想顺便再介绍自己一遍。')
    m2 = m2.replace('下次在学院碰见，可以直接叫我。先说好，笔留着自己用，不再卖了。',
                    '下次在这附近碰见，直接叫我。卖笔这事翻篇，真唱歌的时候可不临时加价。')
    m2 = m2.replace('（柯杰拆开纸袋，', '（柯杰拆开纸袋，')
    # The unlock statement is about all three people, rather than the scene cast.
    m2 = m2.replace('开放范柯杰、范柯杰、杰克·范马', '开放范柯杰、范珂汐、杰克·范马')
    source = source[:start] + m2 + source[end:]
    source = source.replace('M02的珂汐来清吧是这次认识事件，不新增她每晚在清吧等人的日程。',
                            'M02只由范柯杰和杰克出场，范珂汐已经回去；三人解锁后立即各自恢复原有日程。')
    source = source.replace('她拒绝进入夜总会；开场M02会在清吧遇见她；解锁后仍按原有日程活动，去清吧捧场不写成每晚都在那里的固定排班。',
                            '她拒绝进入夜总会；M01后先回去，不在M02清吧现场；解锁后按原有日程活动，不新增清吧固定排班。')
    jack_start = sections(source)['npc_jack_fanma'][0]
    d14_start = source.index('### D14｜', jack_start)
    d14_end = source.index('### D15｜', d14_start)
    d14 = source[d14_start:d14_end].replace('珂汐', '柯杰')
    d14 = d14.replace('她把小吃', '他把小吃').replace('她说', '他说').replace('记着她迟到', '记着他迟到').replace('她要听', '他要听').replace('让她知道', '让他知道').replace('抢了她的话', '抢了他的话')
    source = source[:d14_start] + d14 + source[d14_end:]

    # Insert the exact legacy E/S text before the next NPC/appendix boundary.
    for npc_id, (start, end, chunk) in reversed(list(sections(source).items())):
        if npc_id not in old_sections:
            continue
        old = old_sections[npc_id][2]
        story = old[old.index('## 故事线'):].rstrip().removesuffix('---').rstrip()
        new_chunk = chunk.rstrip().removesuffix('---').rstrip() + '\n\n' + story + '\n\n---\n\n'
        source = source[:start] + new_chunk + source[end:]

    changes = []
    new_sections = sections(source)
    for npc_id, (_, _, chunk) in new_sections.items():
        old = scene_bodies(old_sections.get(npc_id, (0, 0, ''))[2])
        for scene_id, body in scene_bodies(chunk).items():
            state = 'added' if scene_id not in old else 'unchanged' if visible_body(body) == visible_body(old[scene_id]) else 'updated'
            metadata_only = state == 'unchanged' and scene_id in old and '\n'.join(x.strip() for x in body.splitlines() if x.strip() and not x.startswith('**地点')) != '\n'.join(x.strip() for x in old[scene_id].splitlines() if x.strip() and not x.startswith('**地点'))
            changes.append({'npcId': npc_id, 'sceneId': scene_id, 'status': 'metadata_updated' if metadata_only else state,
                            'contentStatus': state,
                            'bodySha256': hashlib.sha256(visible_body(body).encode()).hexdigest().upper()})
    assert len(new_sections) == 12
    assert sum(x['sceneId'].startswith('D') for x in changes) == 180
    assert sum(x['sceneId'].startswith('T') for x in changes) == 60
    assert sum(x['sceneId'].startswith('E') for x in changes) == 27
    assert sum(x['sceneId'].startswith('S') for x in changes) == 18
    assert all(x['contentStatus'] == 'unchanged' for x in changes if x['sceneId'][0] in 'ES')
    assert '珂汐' not in d14 and '她' not in d14
    Path(args.output).write_text(source, encoding='utf-8', newline='\n')
    report = {'source': str(Path(args.source).resolve()), 'sourceSha256': hashlib.sha256(input_bytes).hexdigest().upper(),
              'runtimeUnits': len(changes) + 4, 'npcCount': 12, 'scenes': changes,
              'sharedIntroductions': [{'id': 'M01', 'cast': ['npc_fan_kejie', 'npc_fan_kexi']}, {'id': 'M02', 'cast': ['npc_fan_kejie', 'npc_jack_fanma']}],
              'corrections': ['M02 cast and same-day arrival', 'Jack D14 recollection', 'Kexi profile and intro notes'],
              'familiarTopics': ['X01', 'X02']}
    Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'units': report['runtimeUnits'], 'byStatus': {s: sum(x['status'] == s for x in changes) for s in ['unchanged', 'metadata_updated', 'updated', 'added']}}, ensure_ascii=False))


if __name__ == '__main__':
    main()
