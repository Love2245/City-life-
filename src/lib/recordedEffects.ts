export interface RecordedEffect {
  url:string;
  gain:number;
  channel:'action'|'facility'|'ui';
  cooldownMs?:number;
}
export interface RecordedEffectOptions {
  loader?:(url:string)=>Promise<AudioBuffer>;
  now?:()=>number;
  maxVoices?:number;
}
interface Voice {source:AudioBufferSourceNode;gain:GainNode;channel:RecordedEffect['channel']}

/** A bounded, gesture-unlocked effects bus. It never selects, ducks or changes music. */
export class RecordedEffectPlayer {
  private readonly master:GainNode;
  private readonly buffers=new Map<string,AudioBuffer>();
  private readonly loading=new Map<string,Promise<AudioBuffer>>();
  private readonly failed=new Set<string>();
  private readonly voices=new Set<Voice>();
  private readonly requested=new Map<string,number>();
  private readonly channels=new Map<string,number>();
  private readonly loader:(url:string)=>Promise<AudioBuffer>;
  private readonly now:()=>number;
  private enabled=false;
  private disposed=false;
  private generation=0;
  constructor(private readonly context:AudioContext,private readonly effects:Record<string,RecordedEffect>,private readonly options:RecordedEffectOptions={}){
    this.master=context.createGain();this.master.connect(context.destination);this.master.gain.setValueAtTime(0,context.currentTime);
    this.loader=options.loader??(async url=>{const response=await fetch(url);if(!response.ok)throw new Error('Effect request failed: '+response.status);return context.decodeAudioData(await response.arrayBuffer());});
    this.now=options.now??(()=>performance.now());
  }
  setState(enabled:boolean,volume:number){
    const next=enabled&&volume>0&&!this.disposed;if(this.enabled&&!next){this.generation++;this.stopAll();}this.enabled=next;
    this.master.gain.setValueAtTime(next?Math.max(0,Math.min(1,volume)):0,this.context.currentTime);
  }
  private load(url:string):Promise<AudioBuffer>{
    const cached=this.buffers.get(url);if(cached)return Promise.resolve(cached);
    if(this.failed.has(url))return Promise.reject(new Error('Effect unavailable'));
    const pending=this.loading.get(url);if(pending)return pending;
    const task=this.loader(url).then(buffer=>{if(!this.disposed)this.buffers.set(url,buffer);return buffer;}).catch(error=>{this.failed.add(url);throw error;}).finally(()=>this.loading.delete(url));
    this.loading.set(url,task);return task;
  }
  /** Decode quietly after the first gesture, at most two files at once; shared files decode once. */
  async preload(){
    if(!this.enabled||this.disposed)return;const urls=[...new Set(Object.values(this.effects).map(effect=>effect.url))];let next=0;
    await Promise.all([0,1].map(async()=>{while(next<urls.length&&this.enabled&&!this.disposed){const url=urls[next++]!;await this.load(url).catch(()=>{});}}));
  }
  play(id:string,gain=1,onFallback?:()=>void){
    const effect=this.effects[id];if(!effect||!this.enabled||this.disposed)return;
    const at=this.now(),last=this.requested.get(id);if(last!==undefined&&at-last<(effect.cooldownMs??100))return;
    this.requested.set(id,at);const token=(this.channels.get(effect.channel)??0)+1;this.channels.set(effect.channel,token);
    const generation=this.generation;
    const current=()=>this.enabled&&!this.disposed&&generation===this.generation&&this.channels.get(effect.channel)===token&&this.now()-at<500;
    void this.load(effect.url).then(buffer=>{
      if(!current())return;
      for(const voice of [...this.voices])if(voice.channel===effect.channel)this.stop(voice);
      while(this.voices.size>=(this.options.maxVoices??6))this.stop(this.voices.values().next().value!);
      const source=this.context.createBufferSource(),node=this.context.createGain(),voice={source,gain:node,channel:effect.channel};
      source.buffer=buffer;node.gain.setValueAtTime(Math.max(0,Math.min(1.5,effect.gain*gain)),this.context.currentTime);source.connect(node);node.connect(this.master);
      source.onended=()=>this.cleanup(voice);this.voices.add(voice);source.start(this.context.currentTime+.005);
    }).catch(()=>{if(current())onFallback?.();});
  }
  private cleanup(voice:Voice){if(!this.voices.delete(voice))return;try{voice.source.disconnect();voice.gain.disconnect();}catch{/* Device closed. */}}
  private stop(voice:Voice){try{voice.source.stop();}catch{/* Already ended. */}this.cleanup(voice);}
  private stopAll(){for(const voice of [...this.voices])this.stop(voice);}
  dispose(){if(this.disposed)return;this.generation++;this.stopAll();this.enabled=false;this.disposed=true;this.buffers.clear();this.master.disconnect();}
}
