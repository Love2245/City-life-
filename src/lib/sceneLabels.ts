export interface SceneNameLabel {id:string;title:string;x:number;y:number;visible:boolean}

/** Keep small name tags inside the viewport and separate nearby shelf labels. */
export function placeSceneLabels(labels:SceneNameLabel[],width:number,height:number,touch=false){
  const w=Math.max(200,width),h=Math.max(160,height),tagHeight=touch?34:27,gap=6;
  const occupied:{x:number;y:number;w:number;h:number}[]=[];
  return labels.filter(label=>label.visible&&Number.isFinite(label.x)&&Number.isFinite(label.y)).map(label=>{
    const tagWidth=Math.min(150,Math.max(48,label.title.length*(touch?12:11)+20));
    const clamp=(n:number,low:number,high:number)=>Math.max(low,Math.min(high,n));
    const anchorX=label.x*w/100,anchorY=label.y*h/100;
    let chosen={x:clamp(anchorX,tagWidth/2+10,w-tagWidth/2-10),y:clamp(anchorY,tagHeight/2+10,h-70-tagHeight/2),w:tagWidth,h:tagHeight},best=Infinity;
    for(const dx of [0,-tagWidth-gap,tagWidth+gap])for(const dy of [0,-1,1,-2,2,-3,3,-4,4]){
      const x=clamp(anchorX+dx,tagWidth/2+10,w-tagWidth/2-10),y=clamp(anchorY+dy*(tagHeight+gap),tagHeight/2+10,h-70-tagHeight/2);
      const overlap=occupied.reduce((sum,other)=>sum+Math.max(0,(tagWidth+other.w)/2+gap-Math.abs(x-other.x))*Math.max(0,(tagHeight+other.h)/2+gap-Math.abs(y-other.y)),0);
      const score=overlap*1000+(x-anchorX)**2+(y-anchorY)**2;
      if(score<best){best=score;chosen={x,y,w:tagWidth,h:tagHeight};}
    }
    occupied.push(chosen);return {...label,x:chosen.x/w*100,y:chosen.y/h*100};
  });
}
