import { FACTORY_POINTS, factoryBoardGeometry, type FactorySnapshot, type FactoryTheme } from "./factoryShift";
import { drawIndustrialScene } from "./industrialCanvas";

export interface FactoryView {
  width: number;
  height: number;
  visualTime: number;
  reducedMotion: boolean;
  arrival: number;
  dragX: number;
}

/** Canvas artwork ported from factory-shift.html; no DOM/global listeners live here. */
export function drawFactoryScene(ctx: CanvasRenderingContext2D, state: FactorySnapshot, view: FactoryView, theme: FactoryTheme) {
  if (theme === "steel" || theme === "aluminum" || theme === "glass") return drawIndustrialScene(ctx, state, view, theme);
  const { width: W, height: H, visualTime, reducedMotion } = view;
  const logistics = theme === "sorting";
  function rr(x: number, y: number, w: number, h: number, r: number, fill?: string, stroke?: string) {
    if (w <= 0 || h <= 0) return;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }
  function text(t: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = "left") {
    ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(t, x, y);
  }
  function chip(x: number, y: number, w: number, h: number, small = false) {
    for (let i = 0; i < 6; i++) {
      rr(x - 7, y + 8 + i * (h - 17) / 5, 8, 4, 1, "#b4b8a8");
      rr(x + w - 1, y + 8 + i * (h - 17) / 5, 8, 4, 1, "#b4b8a8");
    }
    rr(x, y, w, h, 3, "#151e1b", "#536057");
    rr(x + 3, y + 3, w - 6, h - 6, 2, "#222b27");
    ctx.fillStyle = "#536459"; ctx.beginPath(); ctx.arc(x + w / 2, y + 3, 5, 0, Math.PI); ctx.fill();
    if (!small) { text("IC-04", x + w / 2, y + h * .55, "11px Consolas", "#819180", "center"); text("•", x + 9, y + 14, "13px Consolas", "#a1ad96"); }
  }
  function pcb(x: number, y: number, w: number, h: number, mounted: boolean) {
    const scale = w / 360, boardH = h / scale;
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    rr(5, 8, 360, boardH, 6, "#14251f70"); rr(0, 0, 360, boardH, 6, "#43845c", "#70ad71"); rr(5, 5, 350, boardH - 10, 3, "#37744e");
    ctx.strokeStyle = "#66a478"; ctx.lineWidth = 1.5;
    const traces = [[28,44,96,44,96,83,146,83],[27,70,61,70,61,111,140,111],[222,69,275,69,275,34,330,34],[227,91,298,91,298,67,337,67],[220,141,270,141,270,188,326,188],[145,154,112,154,112,201,54,201],[142,136,85,136,85,165,24,165],[205,48,205,25,144,25,144,11],[202,165,202,206,265,206,265,218]];
    for (const p of traces) {
      ctx.beginPath(); ctx.moveTo(p[0], p[1]);
      for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
      ctx.stroke();
      for (let i = 0; i < p.length; i += 2) { ctx.fillStyle = "#9caf74"; ctx.beginPath(); ctx.arc(p[i], p[i + 1], 2, 0, Math.PI * 2); ctx.fill(); }
    }
    for (const [a, b] of [[12,12],[348,12],[12,boardH-12],[348,boardH-12]]) {
      ctx.fillStyle = "#bfc396"; ctx.beginPath(); ctx.arc(a,b,5,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = "#253e2a"; ctx.beginPath(); ctx.arc(a,b,2.5,0,Math.PI*2); ctx.fill();
    }
    for (let i = 0; i < 14; i++) { rr(84 + i * 13, boardH - 13, 8, 13, 1, "#d6bd64"); ctx.fillStyle = "#8d8150"; ctx.fillRect(86+i*13,boardH-10,4,8); }
    for (let i = 0; i < 4; i++) { rr(35,41+i*18,25,8,2,"#bec59f"); ctx.fillStyle="#586b50"; ctx.fillRect(45,41+i*18,4,8); }
    for (let i = 0; i < 3; i++) { ctx.fillStyle="#243b30"; ctx.beginPath(); ctx.arc(309,109+i*25,9,0,Math.PI*2); ctx.fill(); ctx.strokeStyle="#83aa84"; ctx.stroke(); ctx.fillStyle="#8da181"; ctx.fillRect(302,108+i*25,14,2); }
    rr(84,44,32,25,2,"#1d3427");
    for(let i=0;i<3;i++){ctx.fillStyle="#b3bea0";ctx.fillRect(81,49+i*7,3,3);ctx.fillRect(116,49+i*7,3,3);}
    rr(143,58,77,110,2,"#2d5b3e","#b2c594");
    ctx.strokeStyle="#b2c594";ctx.beginPath();ctx.moveTo(171,55);ctx.lineTo(182,48);ctx.lineTo(193,55);ctx.stroke();
    for(let i=0;i<8;i++){rr(139,68+i*12,7,4,1,"#c5c18b");rr(216,68+i*12,7,4,1,"#c5c18b");}
    if (mounted) chip(146,62,70,101);
    else { ctx.setLineDash([4,4]);ctx.strokeStyle="#a4bd90";ctx.strokeRect(150,65,63,96);ctx.setLineDash([]);text("芯片插槽",182,186,'11px "Microsoft YaHei"',"#a9c792","center"); }
    text("PCB-04   REV.2",27,boardH-31,"11px Consolas","#b5cca1"); text("A3",334,boardH-31,"14px Consolas","#b5cca1","right");
    ctx.restore();
  }
  function parcel(x: number, y: number, w: number, h: number) {
    const scale = w / 360, boardH = h / scale;
    ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
    rr(5,8,360,boardH,6,"#14251f70");rr(0,0,360,boardH,6,"#b28d58","#d6b885");rr(6,6,348,boardH-12,3,"#c29a62");
    rr(169,0,23,boardH,0,"#e1c990");rr(0,111,360,18,0,"#dbc18a");
    rr(114,44,136,131,3,"#f2f3ed","#c5c3b4");
    text(state.destination,182,62,'bold 12px "Microsoft YaHei"',"#355844","center");
    for(let i=0;i<19;i++){ctx.fillStyle="#202c26";ctx.fillRect(124+i*6,155,(i%3===0?3:1.5),12);}
    text("UL / "+String(state.boardId).padStart(4,"0"),22,boardH-24,"12px Consolas","#5b4932");
    text("↑↑  FRAGILE",339,boardH-24,"12px Consolas","#5b4932","right");
    text("收件",141,100,'10px "Microsoft YaHei"',"#687268","center");text("片区",221,100,'10px "Microsoft YaHei"',"#687268","center");
    text("件数",141,134,'10px "Microsoft YaHei"',"#687268","center");text("封签",221,134,'10px "Microsoft YaHei"',"#687268","center");
    ctx.restore();
  }
  const ease = (t: number) => 1 - Math.pow(1 - t, 3);
  const geometry = factoryBoardGeometry(W,H), { x,y,w,h,scale } = geometry;
  const compact = H < 280;
  ctx.clearRect(0,0,W,H);ctx.fillStyle="#26322c";ctx.fillRect(0,0,W,H);ctx.strokeStyle="#39443b";ctx.lineWidth=.5;ctx.beginPath();
  for(let x=0;x<W;x+=26){ctx.moveTo(x,0);ctx.lineTo(x,H);}for(let y=0;y<H;y+=26){ctx.moveTo(0,y);ctx.lineTo(W,y);}ctx.stroke();
  const beltY = compact ? Math.max(5, y - 27) : 57;
  const beltHeight = compact ? 24 : 46;
  rr(0,beltY,W,beltHeight,0,"#1b2721");ctx.fillStyle="#34433a";ctx.fillRect(0,beltY+1,W,2);ctx.fillRect(0,beltY+beltHeight-3,W,2);
  const flow=reducedMotion?0:visualTime*17;
  for(let bx=-140+flow%140;bx<W;bx+=140){const cy=beltY+beltHeight/2,r=compact?7:14;ctx.strokeStyle="#3d4e40";ctx.lineWidth=compact?2:3;ctx.beginPath();ctx.moveTo(bx,cy-r);ctx.lineTo(bx+r,cy);ctx.lineTo(bx,cy+r);ctx.stroke();}
  const stage=state.stage,mounted=stage!=="ready"&&stage!=="docking",readyToShip=stage==="ship"||stage==="shipping";
  let dx = view.dragX;
  if(stage==="shipping")dx=view.dragX+(W-x-view.dragX+25)*ease(state.animationProgress);
  if(view.arrival>0&&stage==="ready")dx-=view.arrival/.3*35;
  if(W>580 && H>=300){rr(23,152,104,107,4,"#1d2923","#53634f");text(logistics?"INBOUND":"COMPONENTS",36,172,"10px Consolas","#a8b8a1");
    if(logistics){rr(51,188,45,52,3,"#bb955d");rr(69,188,10,52,0,"#e1c990");}else chip(53,188,42,52,true);
    text(logistics?"待分拣货物":"芯片托盘",36,277,'12px "Microsoft YaHei"',"#b9cdb4");}
  const dropX=Math.max(x+w+18,W-110);
  if(readyToShip){const dropY=Math.max(8,y-5),dropH=Math.min(H-dropY-8,h+10);rr(dropX,dropY,W-dropX-15,dropH,6,"#437d4430","#a3c888");ctx.setLineDash([5,6]);rr(dropX+4,dropY+4,W-dropX-23,dropH-8,5,undefined,"#9ac68b");ctx.setLineDash([]);
    const ay=y+h/2;ctx.strokeStyle="#b3da9e";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(dropX+13,ay);ctx.lineTo(W-29,ay);ctx.lineTo(W-38,ay-8);ctx.moveTo(W-29,ay);ctx.lineTo(W-38,ay+8);ctx.stroke();
    if(W>480 && dropH>85)text(logistics?"向右归库":"向右送出",dropX+8,ay+Math.min(33,dropH/3),'12px "Microsoft YaHei"',"#c3dbae");}
  const fixtureInset = Math.min(14, y-2, H-y-h-2);
  rr(x-17,y-fixtureInset,w+34,h+fixtureInset*2,6,"#223026",readyToShip?"#9dc180":"#65795d");
  if(logistics)parcel(x+dx,y,w,h);else pcb(x+dx,y,w,h,mounted);
  if(stage==="ready"){ctx.setLineDash([5,6]);ctx.strokeStyle="#f4cc4b9e";ctx.lineWidth=1.5;ctx.strokeRect(x-6,y-6,w+12,h+12);ctx.setLineDash([]);}
  if(stage==="docking"){
    const t=ease(state.animationProgress),cx=x+146*scale,cy=y+62*scale;
    if(logistics){ctx.strokeStyle="#f4cc4b";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+114*scale,y+(44+131*t)*scale);ctx.lineTo(x+250*scale,y+(44+131*t)*scale);ctx.stroke();}
    else{ctx.save();ctx.globalAlpha=.4+.6*t;chip(cx,cy-(1-t)*90,70*scale,101*scale,true);ctx.restore();}
  }
  if(stage==="welding"){
    const p=FACTORY_POINTS[state.activePoint],px=x+p.x*scale,py=y+p.y*scale;
    if(!logistics){ctx.strokeStyle="#c6cdba";ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(px+48,py-54);ctx.lineTo(px+5,py-5);ctx.stroke();ctx.strokeStyle="#e7d878";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(px+5,py-5);ctx.lineTo(px,py);ctx.stroke();}
    if(!reducedMotion){for(let i=0;i<6;i++){const angle=i*Math.PI/3+visualTime*7,r=15+Math.sin(visualTime*35+i)*5;ctx.strokeStyle="#fff0a1";ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(px+Math.cos(angle)*9,py+Math.sin(angle)*9);ctx.lineTo(px+Math.cos(angle)*r,py+Math.sin(angle)*r);ctx.stroke();}}
  }
  return { ...geometry, dx };
}
