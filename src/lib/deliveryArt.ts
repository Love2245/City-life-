import { deliveryDistrict } from '../game/core/deliveryDistrict';
import type { DeliveryPoint } from '../game/core/minigame';
const esc = (v: string) => v.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const deliveryThemes = [
  {accent:'#d57943', ink:'#374d46', paper:'#fff8e9', land:'#c8d9ae', road:'#667774', curb:'#ece2c9', leaf:'#76a076', roof:'#bb7c61', sky:'#eaf2da', name:'梧桐里', subtitle:'午间配送 · 街巷与食堂', label:'LUNCH DELIVERY'},
  {accent:'#547f9c', ink:'#344a59', paper:'#f2f6f2', land:'#ccd5c9', road:'#6b7f88', curb:'#e8e5d4', leaf:'#849b76', roof:'#7a9bb0', sky:'#e3eced', name:'城东物流园', subtitle:'集中装车 · 沿线派件', label:'PARCEL ROUTE'},
  {accent:'#4f9e98', ink:'#345660', paper:'#f2f7ef', land:'#c3d9cc', road:'#617c87', curb:'#e5e9da', leaf:'#78aa91', roof:'#78a4b1', sky:'#e4f2ed', name:'滨江商务区', subtitle:'预约接送 · 平稳行车', label:'RIVERSIDE RIDE'},
  {accent:'#e6b163', ink:'#ede3c5', paper:'#354b57', land:'#334d51', road:'#233841', curb:'#5d6662', leaf:'#436c61', roof:'#ae7c67', sky:'#314951', name:'老城环线', subtitle:'华灯初上 · 街边扬招', label:'OLD TOWN TAXI'},
  {accent:'#bc7854', ink:'#44554b', paper:'#fff7e7', land:'#bfd0ae', road:'#637c76', curb:'#e8ddc4', leaf:'#6a9a75', roof:'#b57a5f', sky:'#e4eddb', name:'双桥片区', subtitle:'多单接力 · 跨桥配送', label:'CROSS BRIDGE'},
];
export function deliveryTheme(key: string, mode: string) { return deliveryThemes[deliveryDistrict(key, mode).variant]; }
function tree(x: number, y: number, color: string, size = 1) {
  return `<g transform="translate(${x} ${y}) scale(${size})"><ellipse cy="12" rx="17" ry="8" fill="#294d4e" opacity=".13"/><path d="M0 15v-23" stroke="#807554" stroke-width="5"/><path d="M-17 0q-12-18 3-23Q-10-42 7-34q18-4 20 15Q38-3 18 5z" fill="${color}"/><path d="M-12-19q3-12 17-10" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="5" stroke-linecap="round"/></g>`;
}
function building(p: DeliveryPoint, pickup: boolean, variant: number, index: number) {
  const night = variant === 3, warehouse = variant === 1 && pickup, glass = variant === 2;
  const x=p.x,y=p.y, w=warehouse?53:42, depth=warehouse?19:12, height=glass?55:28;
  const roof = warehouse?'#819baa':glass?'#7396a5':pickup?['#bc7758','#91a38a','#bb9560'][index%3]:['#a9b493','#9cae9f','#8ca7af','#b6a688'][index%4];
  const wall=night?'#837e6c':pickup?'#f7e4b7':'#f0ead5';
  const windows=Array.from({length:glass?3:2},(_,row)=>Array.from({length:warehouse?4:3},(_,i)=>`<rect x="${-w+10+i*(warehouse?23:23)}" y="${-height+9+row*16}" width="12" height="10" rx="1" fill="${night?'#efc87e':'#75959b'}"/><path d="M${-w+16+i*23} ${-height+9+row*16}v10" stroke="#f3e8cf" stroke-width="1"/>`).join('')).join('');
  return `<g transform="translate(${x} ${y})"><path d="M${-w+5} 21h${w*2}l17 10H${-w+21}z" fill="#2d4d49" opacity=".16"/>
    <path d="M${w} ${-height}l${depth} -10v${height+30}l${-depth} 10z" fill="${night?'#68685d':'#c0bcaa'}"/>
    <rect x="${-w}" y="${-height}" width="${w*2}" height="${height+22}" rx="2" fill="${wall}"/>
    ${windows}<rect x="-8" y="6" width="16" height="16" rx="1" fill="#405b5c"/>
    <path d="M${-w-4} ${-height-5}h${w*2+8}l${depth} -12h${-w*2-8}z" fill="${roof}"/><path d="M${-w+5} ${-height-10}h${w*2-16}" stroke="#fff" stroke-opacity=".24" stroke-width="3"/>
    ${warehouse?`<rect x="-34" y="-39" width="34" height="10" fill="#d2ded6"/><path d="M-30-39v10m9-10v10m9-10v10" stroke="#7a98a0"/><rect x="-24" y="8" width="38" height="22" fill="#879593"/><path d="M-23 13h37m-37 5h37m-37 5h37" stroke="#637d85"/>`:
      pickup?`<path d="M-44-1h88v13H-44z" fill="#f7dbab"/><path d="M-44-1h12v13h-12m24-13h12v13h-12m24-13h12v13H4m24-13h16v13H28" fill="${roof}"/><path d="M-44 12q6 6 12 0m0 0q6 6 12 0m0 0q6 6 12 0m0 0q6 6 12 0m0 0q6 6 12 0m0 0q8 6 16 0" stroke="${roof}" fill="none"/>`:''}
    <rect x="-55" y="29" width="110" height="19" rx="5" fill="${night?'#253e48':'#f7f1dc'}" stroke="${night?'#839082':'#b8bea4'}"/><text y="42" text-anchor="middle" fill="${night?'#f3dda3':'#455d57'}" font-size="10" font-family="Microsoft YaHei,sans-serif">${esc(p.name)}</text>
    ${night?'<path d="M-39-14h18" stroke="#eeb56f" stroke-width="3"/><circle cx="41" cy="19" r="4" fill="#e6bf76"/>':''}</g>`;
}
/** Original SVG scenery: each district has its own architecture, palette and waterways. */
export function deliveryMapArt(key: string, mode: string, pickups: DeliveryPoint[], drops: DeliveryPoint[]) {
  const d=deliveryDistrict(key,mode), t=deliveryThemes[d.variant], night=d.variant===3;
  const out=[`<rect width="1050" height="620" fill="${t.land}"/><path d="M0 28h1050M0 600h1050" stroke="${t.curb}" stroke-width="36"/>`];
  for(let c=0;c<3;c++)for(let r=0;r<2;r++){
    const x=d.xs[c]+48,y=d.ys[r]+40,w=d.xs[c+1]-d.xs[c]-96,h=d.ys[r+1]-d.ys[r]-80;
    out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${night?'#3e5956':'#d7e0bd'}"/><rect x="${x+9}" y="${y+9}" width="${w-18}" height="${h-18}" rx="8" fill="none" stroke="${night?'#52716a':'#b9cba3'}" stroke-width="2"/>`);
    if(d.variant===1){out.push(`<g transform="translate(${x+30} ${y+24})"><rect width="${w-60}" height="${h-45}" rx="3" fill="#aec0c3"/><path d="M4 4h${w-68}v${h-53}H4z" fill="#d0dce0"/><path d="M12 14h${w-84}m${84-w} 12h${w-84}m${84-w} 12h${w-84}" stroke="#b0c0c4" stroke-width="6"/></g>`);}
    else if(d.variant===2){out.push(`<g transform="translate(${x+w*.35} ${y+h*.55})"><path d="M-26 18h68l18 12h-65z" fill="#739e9a" opacity=".24"/><path d="M28-46l14-10v77l-14 9z" fill="#769ba6"/><rect x="-28" y="-46" width="56" height="77" fill="#a7c6c9"/><path d="M-33-50h66l14-10h-66z" fill="#8eb0b9"/><path d="M-20-34h41m-41 14h41m-41 14h41m-41 14h41m-41 14h41" stroke="#edf5e9" stroke-width="5"/><path d="M-7-45v74M12-45v74" stroke="#85adb4" stroke-width="2"/></g>`);}
    else {for(let i=0;i<3;i++) out.push(tree(x+30+i*(w-60)/2,y+45+(i%2)*(h-70),t.leaf,.85));out.push(`<path d="M${x+24} ${y+h-19}h${w-48}" stroke="${night?'#8a9077':'#efe8cf'}" stroke-width="8" stroke-linecap="round"/>`);}
  }
  if(d.water){out.push(`<path d="M520 0Q550 150 515 280T550 620h58Q580 450 600 280T575 0z" fill="${night?'#416c74':'#84bec5'}"/><path d="M548 5q18 150 0 260t30 350" fill="none" stroke="#d6eee4" stroke-opacity=".45" stroke-width="3" stroke-dasharray="15 26"/>`);}
  for(const e of d.edges){out.push(`<path d="M${e.a.x} ${e.a.y}L${e.b.x} ${e.b.y}" stroke="${t.curb}" stroke-width="66" stroke-linecap="round"/><path d="M${e.a.x} ${e.a.y}L${e.b.x} ${e.b.y}" stroke="${t.road}" stroke-width="48" stroke-linecap="round"/><path d="M${e.a.x} ${e.a.y}L${e.b.x} ${e.b.y}" stroke="${night?'#d5c58b':'#dedbc0'}" stroke-width="2" stroke-dasharray="12 13"/>`);}
  for(const n of d.nodes){out.push(`<rect x="${n.x-25}" y="${n.y-25}" width="50" height="50" fill="${t.road}"/>`);}
  for(const n of [d.nodes[4],d.nodes[7]]) {
    out.push(`<g fill="${night?'#a3afa0':'#f2efdd'}" opacity=".85">${Array.from({length:5},(_,j)=>`<rect x="${n.x-19+j*9}" y="${n.y-39}" width="5" height="11"/><rect x="${n.x-19+j*9}" y="${n.y+28}" width="5" height="11"/><rect y="${n.y-19+j*9}" x="${n.x-39}" height="5" width="11"/><rect y="${n.y-19+j*9}" x="${n.x+28}" height="5" width="11"/>`).join('')}</g>`);
  }
  if(d.water) for(const y of d.ys) out.push(`<path d="M514 ${y-29}h89m-89 58h89" stroke="${night?'#ddae73':'#e0c795'}" stroke-width="6"/><path d="M517 ${y-35}v12m20-12v12m20-12v12m20-12v12m20-12v12" stroke="#7f938b" stroke-width="3"/>`);
  for(let i=0;i<12;i++) out.push(tree(28+i*86, i%2?587:48,t.leaf,.72));
  pickups.forEach((p,i)=>out.push(building(p,true,d.variant,i)));
  drops.forEach((p,i)=>out.push(building(p,false,d.variant,i)));
  out.push(`<g font-family="Microsoft YaHei,sans-serif" font-size="11" fill="${night?'#d2d4b9':'#546e65'}" opacity=".8"><text x="18" y="20">${t.name} · 城市路网</text><rect x="8" y="599" width="195" height="18" rx="4" fill="${t.paper}"/><text x="16" y="612">${['梧桐大道','仓库大道','滨江路','老城环线','双桥绿道'][d.variant]} · 请礼让行人</text></g>`);
  return out.join('');
}
export const deliverySymbols = `
  <symbol id="dv-car" viewBox="-34 -22 68 44"><ellipse cx="1" cy="4" rx="33" ry="19" fill="#122c38" opacity=".2"/><rect x="-24" y="-19" width="12" height="5" rx="2" fill="#29434b"/><rect x="14" y="-19" width="12" height="5" rx="2" fill="#29434b"/><rect x="-24" y="14" width="12" height="5" rx="2" fill="#29434b"/><rect x="14" y="14" width="12" height="5" rx="2" fill="#29434b"/><path d="M-29-13q-4 12 0 25l13 4h29q15-1 17-11V-5q-2-11-17-11h-29z" fill="currentColor" stroke="#365461" stroke-width="1.4"/><path d="M-14-10h22l9 6v8l-9 6h-22z" fill="#dfebe1"/><path d="M10-9l6 5v8l-6 5" fill="#537482"/><path d="M-14-10l-3 4v12l3 4" fill="#547482"/><path d="M-9-9h17v18H-9z" fill="currentColor"/><path d="M26-10v6m0 8v6" stroke="#fff2ba" stroke-width="3"/><path d="M-27-9v5m0 7v5" stroke="#d38475" stroke-width="3"/><path d="M-20-14h30" stroke="#fff" stroke-opacity=".3" stroke-width="2"/></symbol>
  <symbol id="dv-van" viewBox="-40 -25 80 50"><ellipse cy="5" rx="37" ry="21" fill="#123344" opacity=".2"/><path d="M-30-23h13v6h-13m39-6h13v6H9M-30 16h13v7h-13m39-7h13v7H9" fill="#334850"/><rect x="-36" y="-20" width="49" height="40" rx="5" fill="currentColor" stroke="#436377" stroke-width="1.5"/><path d="M12-19h14q11 2 11 12V7q0 10-11 12H12z" fill="#e0e8d8" stroke="#436377" stroke-width="1.5"/><path d="M22-15l9 6V9l-9 6" fill="#668793"/><path d="M-29-12H5v24h-34z" fill="#f1efdb" opacity=".45"/><path d="M-18-7l9-4 8 4v13l-8 4-9-4z" fill="#ddbc87"/><path d="M-18-7l9 5 8-5m-8 5v12" stroke="#a3815d" fill="none"/><path d="M35-12v5m0 14v5" stroke="#fff1ae" stroke-width="3"/></symbol>
  <symbol id="dv-scooter" viewBox="-32 -23 64 46"><ellipse cy="7" rx="29" ry="16" fill="#344c41" opacity=".2"/><path d="M-23 0h47" stroke="#374c4d" stroke-width="7" stroke-linecap="round"/><rect x="-27" y="-13" width="21" height="26" rx="4" fill="currentColor" stroke="#584b3c" stroke-width="2"/><rect x="-24" y="-10" width="15" height="20" rx="2" fill="#f2d6a2"/><path d="M-24 0h15" stroke="#bc784e" stroke-width="2"/><path d="M4-15q14-4 19 7V9q-5 9-19 6z" fill="currentColor"/><path d="M10-16h9m-9 32h9" stroke="#d7e3cf" stroke-width="3"/><path d="M6-12h-5m5 24h-5" stroke="#40515b" stroke-width="3"/><ellipse cx="2" rx="9" ry="10" fill="#8ab2b0" stroke="#3e5b62" stroke-width="2"/><path d="M1-8h6" stroke="#eaf1df" stroke-width="3"/><path d="M25-4v8" stroke="#fff3b6" stroke-width="3"/></symbol>
  <symbol id="dv-person" viewBox="-14 -24 28 48"><ellipse cy="20" rx="12" ry="4" fill="#244b4c" opacity=".2"/><path d="M-5 6l-2 12m10-12 3 12" stroke="#385c6c" stroke-width="5" stroke-linecap="round"/><path d="M-8-4q8-8 16 0l3 14h-22z" fill="currentColor"/><circle cy="-13" r="7" fill="#efc599"/><path d="M-7-16q1-10 12-6l3 8" fill="#625646"/><path d="M-10-2l-3 9m23-9 3 9" stroke="#efc599" stroke-width="3" stroke-linecap="round"/></symbol>
  <symbol id="dv-bag" viewBox="-26 -30 52 60"><ellipse cy="25" rx="24" ry="5" fill="#453b29" opacity=".15"/><path d="M-20-17h40l4 40h-48z" fill="#e6be80" stroke="#a87e51" stroke-width="2"/><path d="M-9-16v-6q9-11 18 0v6" fill="none" stroke="#a57e51" stroke-width="3"/><path d="M-21-16l7 6v33m35-39-7 6v33" fill="none" stroke="#d09b66" stroke-width="2"/><path d="M-6-18H6V-1H-6z" fill="#bd7054"/><rect x="-10" y="3" width="20" height="15" rx="3" fill="#fff2cf"/><path d="M-5 8H5m-10 5H2" stroke="#bc976b" stroke-width="2"/></symbol>
  <symbol id="dv-parcel" viewBox="-29 -27 58 54"><ellipse cy="22" rx="27" ry="5" fill="#443b29" opacity=".15"/><path d="M-25-14L0-24l25 10V14L0 24-25 14z" fill="#e7bf88" stroke="#987859" stroke-width="2"/><path d="M0-3l25-11v28L0 24z" fill="#bf9466"/><path d="M-25-14L0-3l25-11M0-3v27" fill="none" stroke="#987859" stroke-width="2"/><path d="M-7-21l26 10-8 4L-14-18z" fill="#f5dfba"/><path d="M-19-3l14 5v12l-14-5z" fill="#f9ecd3"/><path d="M-16 0v7m3-6v7m3-6v7" stroke="#746855" stroke-width="1"/></symbol>`;
