import * as THREE from 'three';
import {outdoorPrecipitationSeed} from './weather';

/** Stable particle seeds; all falling motion runs in the vertex shader. */
export function createOutdoorPrecipitation(width:number,depth:number,groundY:number,reducedMotion:boolean){
  const scene=new THREE.Scene();scene.name='outdoor-weather-layer';scene.userData.reducedMotion=reducedMotion;
  const geometries:THREE.BufferGeometry[]=[],materials:THREE.ShaderMaterial[]=[];
  const vertex=`uniform float time;uniform float ground;uniform float pointSize;attribute float seed;attribute float tip;varying float alpha;varying float progress;
    void main(){vec3 p=position;float cycle=fract(p.y-time*(.85+seed*.35));progress=cycle;
    #if MODE == 0
      float h=cycle*8.;p.y=ground+.15+h+tip*(.12+seed*.20);p.x+=h*.06-tip*.02;alpha=(.22+seed*.14)*(1.-tip*.65)*smoothstep(0.,.45,h);
    #elif MODE == 1
      p.y=ground+.15+fract(p.y-time*.075)*9.;p.x+=sin(time*.6+seed*35.)*.1;p.z+=cos(time*.4+seed*35.)*.1;alpha=.75;
    #else
      progress=fract(time*(.85+seed*.35)-p.y)/.16;p.y=ground+.15;alpha=(1.-progress)*.25*step(progress,1.);
    #endif
    gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);gl_PointSize=pointSize;
    #if MODE == 2
      gl_PointSize=2.+clamp(progress,0.,1.)*7.;
    #endif
    }`;
  const fragment=`#include <packing>
    uniform sampler2D sceneDepth;uniform vec2 resolution;uniform vec3 tint;varying float alpha;varying float progress;
    void main(){float d=unpackRGBAToDepth(texture2D(sceneDepth,gl_FragCoord.xy/resolution));if(gl_FragCoord.z>d+.00001)discard;float a=alpha;
    #if MODE == 1
      a*=1.-smoothstep(.12,.5,length(gl_PointCoord-.5));
    #elif MODE == 2
      a*=1.-smoothstep(.035,.12,abs(length((gl_PointCoord-.5)*vec2(1.,2.))-.31));
    #endif
    if(a<.012)discard;gl_FragColor=vec4(tint,a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`;
  function particles(mode:number,count:number){const vertices=mode===0?count*2:count,positions=new Float32Array(vertices*3),seeds=new Float32Array(vertices),tips=new Float32Array(vertices);
    for(let i=0;i<count;i++){const [x,phase,z]=outdoorPrecipitationSeed(i+mode*427,width,depth);for(let j=0;j<(mode===0?2:1);j++){const at=mode===0?i*2+j:i;positions.set([x,phase,z],at*3);seeds[at]=((i*137+17)%193)/193;tips[at]=j;}}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));g.setAttribute('seed',new THREE.BufferAttribute(seeds,1));g.setAttribute('tip',new THREE.BufferAttribute(tips,1));geometries.push(g);
    const m=new THREE.ShaderMaterial({defines:{MODE:mode},uniforms:{time:{value:0},ground:{value:groundY},pointSize:{value:3},sceneDepth:{value:null},resolution:{value:new THREE.Vector2(1,1)},tint:{value:new THREE.Color(mode===1?'#edf3f2':'#b9d0d6')}},vertexShader:vertex,fragmentShader:fragment,transparent:true,depthWrite:false,depthTest:false});materials.push(m);
    const o=mode===0?new THREE.LineSegments(g,m):new THREE.Points(g,m);o.frustumCulled=false;o.userData.skipContactAO=true;scene.add(o);return o;
  }
  const rain=particles(0,420),snow=particles(1,260),splashes=particles(2,100);
  return {scene,
    setWeather(kind:'rain'|'snow'|'none',night:boolean){rain.visible=splashes.visible=kind==='rain';snow.visible=kind==='snow';scene.userData.precipitationActive=kind!=='none';for(const m of materials)m.uniforms.tint.value.set(kind==='snow'?'#edf3f2':night?'#829da8':'#b9d0d6');},
    setDetail(detail:'fine'|'light'){rain.geometry.setDrawRange(0,(detail==='fine'?420:140)*2);snow.geometry.setDrawRange(0,detail==='fine'?260:85);splashes.geometry.setDrawRange(0,detail==='fine'?100:28);snow.material.uniforms.pointSize.value=detail==='fine'?3:2.3;},
    dispose(){geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());scene.clear();},
  };
}
