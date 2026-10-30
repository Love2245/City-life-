import {describe,expect,it,vi} from 'vitest';
import {RecordedEffectPlayer,type RecordedEffect} from '../src/lib/recordedEffects';

const effects:Record<string,RecordedEffect>={
  door:{url:'door.mp3',gain:.8,channel:'facility'},fridge:{url:'fridge.mp3',gain:1,channel:'facility'},
  page:{url:'page.mp3',gain:.7,channel:'action'},click:{url:'click.mp3',gain:.6,channel:'ui'},alias:{url:'door.mp3',gain:.5,channel:'ui'},
};
function rig(options:{loader?:(url:string)=>Promise<AudioBuffer>;maxVoices?:number}={}){
  let now=0;
  const sources:any[]=[],gains:any[]=[];
  const context={currentTime:3,destination:{},createGain:()=>{const node={gain:{setValueAtTime:vi.fn()},connect:vi.fn(),disconnect:vi.fn()};gains.push(node);return node;},
    createBufferSource:()=>{const node={buffer:null,onended:null,start:vi.fn(),stop:vi.fn(),connect:vi.fn(),disconnect:vi.fn()};sources.push(node);return node;}} as unknown as AudioContext;
  const loader=options.loader??vi.fn(async(url:string)=>({id:url}) as unknown as AudioBuffer);
  const player=new RecordedEffectPlayer(context,effects,{...options,loader,now:()=>now});player.setState(true,.5);
  return{player,sources,gains,loader,time:(value:number)=>{now=value;}};
}
async function settle(){for(let i=0;i<8;i++)await Promise.resolve();}
function deferred(){let resolve!:(value:AudioBuffer)=>void,reject!:(error:Error)=>void;const promise=new Promise<AudioBuffer>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}

describe('离线交互音效播放生命周期',()=>{
  it('预加载只解码唯一文件，最多两个同时读取，完成前不会发声',async()=>{
    const work=new Map<string,ReturnType<typeof deferred>>();let active=0,peak=0;
    const loader=vi.fn((url:string)=>{active++;peak=Math.max(peak,active);const d=deferred();work.set(url,d);return d.promise.finally(()=>{active--;});});
    const r=rig({loader});const loading=r.player.preload();await settle();expect(loader).toHaveBeenCalledTimes(2);
    for(let pass=0;pass<8;pass++){for(const [url,d] of [...work]){work.delete(url);d.resolve({} as AudioBuffer);}await settle();}
    await loading;expect(peak).toBe(2);expect(loader).toHaveBeenCalledTimes(4);expect(r.sources).toHaveLength(0);
    await r.player.preload();expect(loader).toHaveBeenCalledTimes(4);
    r.player.play('door');await settle();expect(r.sources).toHaveLength(1);expect(loader).toHaveBeenCalledTimes(4);
  });
  it('同一声音短时间连点不叠加，超过冷却后替换同通道声音',async()=>{
    const r=rig();r.player.play('door');await settle();r.time(50);r.player.play('door');await settle();expect(r.sources).toHaveLength(1);
    r.time(140);r.player.play('door');await settle();expect(r.sources).toHaveLength(2);expect(r.sources[0].stop).toHaveBeenCalledOnce();expect(r.sources[0].disconnect).toHaveBeenCalledOnce();
  });
  it('慢加载的旧操作不会覆盖随后选择的家具',async()=>{
    const old=deferred(),recent=deferred();const r=rig({loader:url=>url==='door.mp3'?old.promise:recent.promise});
    r.player.play('door');r.time(30);r.player.play('fridge');recent.resolve({id:'recent'} as unknown as AudioBuffer);await settle();old.resolve({id:'old'} as unknown as AudioBuffer);await settle();
    expect(r.sources).toHaveLength(1);expect(r.sources[0].buffer.id).toBe('recent');
  });
  it('超过半秒才准备好的录音不在操作结束后补播',async()=>{
    const d=deferred(),r=rig({loader:()=>d.promise});r.player.play('door');r.time(501);d.resolve({} as AudioBuffer);await settle();expect(r.sources).toHaveLength(0);
  });
  it.each(['mute','zero'] as const)('%s 会停止当前声音并丢弃待加载请求，恢复不补播',async(mode)=>{
    const d=deferred(),r=rig({loader:url=>url==='fridge.mp3'?d.promise:Promise.resolve({} as AudioBuffer)});
    r.player.play('page');await settle();r.player.play('fridge');r.player.setState(mode==='zero',mode==='zero'?0:.5);
    expect(r.sources[0].stop).toHaveBeenCalledOnce();d.resolve({} as AudioBuffer);await settle();r.player.setState(true,.5);await settle();expect(r.sources).toHaveLength(1);
    r.time(250);r.player.play('fridge');await settle();expect(r.sources).toHaveLength(2);
  });
  it('不同通道允许少量同时发声，超过总上限停止最早的一段',async()=>{
    const r=rig({maxVoices:2});r.player.play('door');await settle();r.player.play('page');await settle();expect(r.sources[0].stop).not.toHaveBeenCalled();
    r.player.play('click');await settle();expect(r.sources[0].stop).toHaveBeenCalledOnce();expect(r.sources[1].stop).not.toHaveBeenCalled();
    r.sources[1].onended();expect(r.sources[1].disconnect).toHaveBeenCalledOnce();
  });
  it('独立总线音量被限制在0到1，单次音量也有上限',async()=>{
    const r=rig();r.player.setState(true,2);expect(r.gains[0].gain.setValueAtTime).toHaveBeenLastCalledWith(1,3);
    r.player.play('fridge',8);await settle();expect(r.gains[1].gain.setValueAtTime).toHaveBeenCalledWith(1.5,3);
  });
  it('损坏文件只读取一次，当前操作回退，已静音的操作不回退',async()=>{
    const fallback=vi.fn(),loader=vi.fn(async()=>{throw new Error('bad file');}),r=rig({loader});
    r.player.play('door',1,fallback);await settle();expect(fallback).toHaveBeenCalledOnce();r.time(200);r.player.play('door',1,fallback);await settle();expect(loader).toHaveBeenCalledOnce();expect(fallback).toHaveBeenCalledTimes(2);
    r.time(400);r.player.play('fridge',1,fallback);r.player.setState(false,.5);await settle();expect(fallback).toHaveBeenCalledTimes(2);
  });
  it('释放场景总线后停止并断开所有声音，未完成读取也不会再发声',async()=>{
    const d=deferred(),r=rig({loader:url=>url==='fridge.mp3'?d.promise:Promise.resolve({} as AudioBuffer)});
    r.player.play('door');await settle();r.player.play('fridge');r.player.dispose();r.player.dispose();d.resolve({} as AudioBuffer);await settle();r.player.setState(true,.5);r.time(200);r.player.play('page');await settle();
    expect(r.sources).toHaveLength(1);expect(r.sources[0].stop).toHaveBeenCalledOnce();expect(r.gains[0].disconnect).toHaveBeenCalledOnce();
  });
});
