import {createServer} from 'vite';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
const root=resolve(import.meta.dirname,'..'),out=join(root,'docs/cat-duel-refine-1498-20261029');mkdirSync(out,{recursive:true});
const ssr=await createServer({root,configFile:false,appType:'custom',logLevel:'error',server:{middlewareMode:true,hmr:false},optimizeDeps:{noDiscovery:true,include:[]}});
let api={};try{for(const name of ['state','cat','catBattle','catDuelCollection','catDuelCards'])Object.assign(api,await ssr.ssrLoadModule('/src/game/core/'+name+'.ts'));}finally{await ssr.close();}
const builds={
  起始牌组:['scratch','pounce','guard','fortify','meow','catnap'],
  连击:['scratch','flurry','black_exclusive','spider_exclusive','meow','guard'],
  防反:['guard','hold_line','counter_stance','shield_claw','cow_exclusive','fortify'],
  力量:['scratch','pounce','battle_yell','orange_exclusive','guard','meow'],
  异常:['venom_bite','web_trap','atk_mystic','catnap','guard','catalyst'],
};
function fixture(seed,ids,plus){const s=api.createInitialState(seed);api.adoptCat(s,'orange');s.pets[0].level=100;s.flags.cat_duel_practice=true;const d=api.ensureCatDuel(s);d.decks[s.activePet]=ids.flatMap(id=>[false,true].map(()=>{const uid='dc_'+(++d.sequence);d.collection.push({uid,cardId:id,upgraded:plus});return uid;}));return s;}
function score(b,uid){const card=api.cardInBattle(b,uid),e=card.effect,p=api.previewDuelCard(b,uid),i=b.enemyIntent;
  const threat=i?.kind==='attack'?api.enemyDamage(b)*(i.hits??1):0,needed=Math.max(0,threat-b.playerBlock);
  let n=p.damage+p.minionDamage+(p.damage>=b.opponent.hp?25:0)+Math.min(p.block,needed)*(b.player.hp<30?1.55:.95)+p.heal*.8;
  n+=(e.strength??0)*Math.min(5,b.opponent.hp/15)+(e.poison??0)*Math.min(4,b.opponent.hp/12)+(e.weak??0)*(threat>0?2.5:1.2)+(e.vulnerable??0)*2;
  if(e.poisonFactor)n+=b.duel.conditions.opponent.poison*(e.poisonFactor-1)*2;
  n+=(e.retaliate??0)*(i?.kind==='attack'?(i.hits??1):0)+(e.draw??0)*(b.playerEnergy-card.cost>0?2.3:.4);
  n+=e.retainBlock?Math.min(e.retainBlock,Math.max(0,b.playerBlock+p.block-threat))*.6:0;
  return n/Math.pow(Math.max(.75,card.cost),.35);
}
function play(seed,ids,plus,opponent){const s=fixture(seed,ids,plus);const r=api.startBattle(s,opponent);if(!r.ok)throw Error(r.reason);let steps=0;
  while(!s.catBattle.finished&&s.catBattle.turn<=24){const b=s.catBattle;let played=0;
    while(!b.finished&&played<40){const available=b.playerHand.filter(uid=>api.cardInBattle(b,uid).cost<=b.playerEnergy).map(uid=>({uid,score:score(b,uid)})).filter(x=>x.score>0).sort((a,c)=>c.score-a.score);if(!available.length)break;
      if(!api.playCard(s,available[0].uid).ok)throw Error('Bot failed to play');played++;steps++;
    }if(!b.finished)api.endPlayerTurn(s);
  }
  return {won:!!s.catBattle.won,turns:s.catBattle.turn,hp:s.catBattle.player.hp,truncated:!s.catBattle.finished,steps};
}
const targets=['wild_stray','t1_rookie','opp_burger','opp_lightning','opp_web','t2_tech','opp_skeleton','opp_ghost','opp_necro','opp_killer','opp_machine','roundhead'];
const report={rulesVersion:2,seedCount:20,policy:'Deterministic greedy bot using public card previews and committed enemy intent. This is a balance probe, not a claim about human win rates.',rows:[]};
for(const [name,ids] of Object.entries(builds))for(const plus of [false,true])for(const opponent of targets){
  const results=Array.from({length:report.seedCount},(_,i)=>play(1498000+i,ids,plus,opponent));const wins=results.filter(r=>r.won);
  const row={build:name,plus,opponent,wins:wins.length,total:results.length,winRate:wins.length/results.length,avgTurns:results.reduce((n,r)=>n+r.turns,0)/results.length,truncated:results.filter(r=>r.truncated).length};report.rows.push(row);
}
report.acceptance={starterBeatsBeginner:report.rows.find(r=>r.build==='起始牌组'&&!r.plus&&r.opponent==='wild_stray').wins>=16,
  fourBuildsBeatEliteAndBoss:['连击','防反','力量','异常'].every(name=>report.rows.some(r=>r.build===name&&r.plus&&r.opponent==='roundhead'&&r.wins>0)&&report.rows.some(r=>r.build===name&&r.plus&&r.opponent==='t2_tech'&&r.wins>0))};
writeFileSync(join(out,'balance.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({battles:report.rows.length*report.seedCount,acceptance:report.acceptance,summary:report.rows.filter(r=>['wild_stray','t2_tech','roundhead'].includes(r.opponent)).map(r=>({build:r.build,plus:r.plus,enemy:r.opponent,wins:r.wins,turns:r.avgTurns}))},null,2));
if(Object.values(report.acceptance).some(v=>!v))process.exitCode=1;
