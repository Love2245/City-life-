/** Keep the loading illustration moving on compositor layers while WebGL/GLTF work occupies JS. */
export interface LoadingMotionLayer { url: string; className: string; origin: string; delay: string }
export interface LoadingComposition {
  layers: LoadingMotionLayer[];
  dispose(): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const paintProperties = ['fill','fill-opacity','fill-rule','stroke','stroke-width','stroke-opacity',
  'stroke-dasharray','stroke-dashoffset','stroke-linecap','stroke-linejoin','opacity','color'];
const motions = [
  ['.cloud', 'cloud'], ['.sun-halo', 'sun-halo'], ['.stars', 'stars'],
  ['.waterlines', 'waterlines'], ['.plant', 'plant'], ['.wheel', 'wheel'],
  ['.mountain-mist', 'mountain-mist'], ['.festival-light', 'festival-light'],
  ['.fountain-jets', 'fountain-jets'], ['.rain', 'rain'], ['.snow', 'snow'],
  ['.cold-wind', 'cold-wind'], ['.heat-haze', 'heat-haze'], ['.ripples', 'ripples'],
  ['.lake-ripples ellipse', 'ripple-layer'],
] as const;

/** Generated SVG images contain only local vector geometry and baked colors; no scripts or external assets. */
export async function createLoadingComposition(svg: SVGSVGElement): Promise<LoadingComposition> {
  const empty:LoadingComposition={layers:[],dispose(){}};
  if(typeof URL.createObjectURL!=='function'||typeof svg.getBBox!=='function')return empty;
  const sources:SVGGraphicsElement[]=[],urls:string[]=[],layers:LoadingMotionLayer[]=[];
  function styledClone(source:Element):Element {
    const copy=source.cloneNode(false) as Element;
    copy.removeAttribute('class');copy.removeAttribute('style');
    const computed=getComputedStyle(source);
    for(const property of paintProperties){
      const value=computed.getPropertyValue(property).replace(/url\(["']?[^)#]*#([^\)"']+)["']?\)/g,'url(#$1)');
      if(value)copy.setAttribute(property,value);
    }
    for(const child of source.children)copy.append(styledClone(child));
    return copy;
  }
  const dispose=()=>{
    for(const source of sources)source.removeAttribute('data-loading-motion-source');
    urls.forEach(url=>URL.revokeObjectURL(url));
  };
  try{
    const defs=svg.querySelector('defs'),clip=svg.querySelector('.drawing')?.getAttribute('clip-path');
    for(const [selector,className]of motions){
      for(const source of svg.querySelectorAll<SVGGraphicsElement>(selector)){
        const box=source.getBBox();if(!box.width||!box.height)continue;
        const image=document.createElementNS(SVG_NS,'svg');image.setAttribute('xmlns',SVG_NS);image.setAttribute('viewBox','0 0 1000 430');
        if(defs)image.append(styledClone(defs));
        const frame=document.createElementNS(SVG_NS,'g');if(clip)frame.setAttribute('clip-path',clip);
        const copy=styledClone(source);copy.setAttribute('opacity','1');frame.append(copy);image.append(frame);
        const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(image)],{type:'image/svg+xml'}));urls.push(url);
        const opacity=getComputedStyle(source).opacity;
        // Preserve each cloud's staggered period; all positioning uses a shared viewBox.
        const classes=className==='cloud'?source.getAttribute('class')?.split(/\s+/).filter(name=>name.startsWith('cloud')).join(' ')??'cloud':className;
        layers.push({url,className:classes,origin:`${(box.x+box.width/2)/10}% ${(['plant','fountain-jets'].includes(className)?box.y+box.height:box.y+box.height/2)/4.3}%`,
          delay:source.getAttribute('style')??`--source-opacity:${opacity}`});
        sources.push(source);
      }
    }
    // Windows are batched into one layer to avoid a texture for every little window.
    const windows=[...svg.querySelectorAll<SVGGraphicsElement>('.lit')];
    if(windows.length&&svg.closest('[data-time="night"],[data-time="late-night"]')){
      const image=document.createElementNS(SVG_NS,'svg');image.setAttribute('xmlns',SVG_NS);image.setAttribute('viewBox','0 0 1000 430');
      windows.forEach(source=>{const copy=styledClone(source);copy.setAttribute('opacity','1');image.append(copy);sources.push(source);});
      const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(image)],{type:'image/svg+xml'}));urls.push(url);
      layers.push({url,className:'window-lights',origin:'50% 50%',delay:''});
    }
    await Promise.all(urls.map(url=>new Promise<void>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve();image.onerror=()=>reject(new Error('Loading illustration layer could not decode'));image.src=url;})));
    sources.forEach(source=>source.setAttribute('data-loading-motion-source',''));
    return {layers,dispose};
  }catch{dispose();return empty;}
}
