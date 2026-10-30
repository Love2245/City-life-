// @vitest-environment jsdom
import {afterEach,it,expect} from 'vitest';
import {flushSync,mount,unmount} from 'svelte';
import CompanyFinance from '../src/components/layout/CompanyFinance.svelte';
import ArcadeView from '../src/views/ArcadeView.svelte';
import {createInitialState} from '../src/game/core/state';
import {registerCompany} from '../src/game/core/company';
import {replaceState,gameState} from '../src/stores/gameStore.svelte';

const apps:ReturnType<typeof mount>[]=[];afterEach(async()=>{for(const app of apps.splice(0))await unmount(app);document.body.replaceChildren();});
function prepared(){const s=createInitialState(149727);s.mode='eternal';s.player.money=100000;s.time.hour=10;s.locationId='municipal_hall';s.developmentHistory!.total=5;s.developmentHistory!.byType={home_design:5};expect(registerCompany(s,'月度财务',2).ok).toBe(true);s.locationId='company_office_single';s.company!.balanceCents=1000000;s.player.money=1000;replaceState(s);return s;}
function root(){const e=document.createElement('div');document.body.append(e);return e;}
function click(target:HTMLElement,text:string){const b=[...target.querySelectorAll('button')].find(b=>b.textContent?.trim()===text);expect(b,text).toBeDefined();flushSync(()=>b!.click());}
it('资金页只展示简洁月度预计收入与支出，提现前标出税款和净到账，查看不扣税',()=>{
  prepared();const e=root(),before=JSON.stringify(gameState);apps.push(mount(CompanyFinance,{target:e}));flushSync();
  expect(e.textContent).toContain('预期收支');expect(e.textContent).toContain('本月预计收入');expect(e.textContent).toContain('本月预计支出');expect(e.querySelector('.schedule')).toBeNull();expect(e.textContent).not.toContain('未来30天');
  expect(JSON.stringify(gameState)).toBe(before);click(e,'提到个人');expect(e.querySelector('[data-withdrawal-tax]')!.getAttribute('data-withdrawal-tax')).toBe('20000');expect(e.querySelector('.tax-quote')!.textContent).toContain('实际到账 ¥800');expect(gameState.player.money).toBe(1000);
  click(e,'确认提现');expect(gameState.player.money).toBe(1800);expect(gameState.company!.balanceCents).toBe(900000);expect(gameState.company!.ledger.filter(e=>e.kind==='withdrawal_tax')).toHaveLength(1);
});
it('小游戏合集展示一级、二级、三级和办公室四类，分类操作不改游戏存档',()=>{
  prepared();const e=root(),before=JSON.stringify(gameState);apps.push(mount(ArcadeView,{target:e}));flushSync();const tours=e.querySelector<HTMLElement>('[data-arcade-category="homes"]')!;
  expect(tours.querySelectorAll('[data-tour-category]')).toHaveLength(4);expect(tours.textContent).toContain('普通出租屋');
  click(tours,'二级住所');expect(tours.querySelector('[data-tour-home="boyue_talent_apartment"]')).not.toBeNull();expect(tours.querySelector('[data-tour-home="hotel"]')).not.toBeNull();
  click(tours,'三级住所');expect(tours.querySelector('[data-tour-home="own_villa"]')).not.toBeNull();expect(tours.querySelector('[data-tour-home="own_apartment"]')).not.toBeNull();
  click(tours,'办公室');expect(tours.querySelectorAll('[data-tour-office]')).toHaveLength(4);expect(tours.querySelectorAll('[data-tour-home]')).toHaveLength(0);expect(JSON.stringify(gameState)).toBe(before);
});
