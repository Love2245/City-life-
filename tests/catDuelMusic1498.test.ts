import {describe,it,expect,vi} from 'vitest';
import {DUEL_MUSIC_IDS,duelMusicForScene,isDuelMusicId} from '../src/lib/catDuelMusic';
import {DUEL_MUSIC} from '../src/lib/catDuelMusicCatalogue';
describe('1.498 对决临时配乐路由',()=>{
  it('按现代场地选择四套配乐，街巷夜晚使用柔和都市爵士',()=>{
    expect(duelMusicForScene('alley',12)).toBe('duel-street');
    expect(duelMusicForScene('alley',18)).toBe('duel-street');
    expect(duelMusicForScene('alley',22)).toBe('duel-garden');
    expect(duelMusicForScene('alley',2)).toBe('duel-garden');
    expect(duelMusicForScene('park',12)).toBe('duel-garden');
    expect(duelMusicForScene('arena',22)).toBe('duel-arcade');
    expect(duelMusicForScene('boss',12)).toBe('duel-final');
  });
  it('四首作品均有不同的可内联本地资源，路由不使用随机数',()=>{
    const random=vi.spyOn(Math,'random').mockImplementation(()=>{throw Error('music consumed RNG');});
    try{expect(DUEL_MUSIC_IDS.every(id=>isDuelMusicId(id)&&DUEL_MUSIC[id].id===id&&DUEL_MUSIC[id].url)).toBe(true);expect(new Set(Object.values(DUEL_MUSIC).map(v=>v.url)).size).toBe(4);expect(isDuelMusicId('legacy')).toBe(false);expect(duelMusicForScene('boss',22)).toBe(duelMusicForScene('boss',22));}finally{random.mockRestore();}
  });
});
