<script lang="ts">
  import type { StockSnapshot } from '../game/stockTypes';
  import { stockTimeLabel } from '../game/core/stockMath';
  let {history,stockId,mode='trend',costCents=null}:{history:StockSnapshot[];stockId:string;mode?:'trend'|'daily';costCents?:number|null}=$props();
  let clientWidth=$state(900);
  const chartWidth=$derived(Math.max(280,clientWidth));
  const right=$derived(chartWidth-24);
  function fitChart(node:HTMLDivElement){
    const measure=()=>{if(node.clientWidth>0)clientWidth=node.clientWidth;};
    measure();
    if(typeof ResizeObserver==='undefined'){
      window.addEventListener('resize',measure);
      return{destroy:()=>window.removeEventListener('resize',measure)};
    }
    // Changing the SVG dimensions inside the observer can trigger another layout
    // in the same delivery. Measure once on the next frame instead.
    let frame:number|null=null;
    const observer=new ResizeObserver(()=>{
      if(frame===null)frame=requestAnimationFrame(()=>{frame=null;measure();});
    });
    observer.observe(node);
    return{destroy:()=>{observer.disconnect();if(frame!==null)cancelAnimationFrame(frame);}};
  }
  const points=$derived(history.filter(h=>Number.isFinite(h.prices[stockId])).map(h=>({minute:h.minute,value:h.prices[stockId]})));
  const bars=$derived.by(()=>{const result:Array<{day:number;open:number;close:number;high:number;low:number}>=[];let previous=points[0]?.value??1;for(const p of points){const day=Math.floor((p.minute-(p.minute%1440===0?1:0))/1440);let bar=result[result.length-1];if(!bar||bar.day!==day){bar={day,open:previous,close:p.value,high:Math.max(previous,p.value),low:Math.min(previous,p.value)};result.push(bar);}else{bar.close=p.value;bar.high=Math.max(bar.high,p.value);bar.low=Math.min(bar.low,p.value);}previous=p.value;}return result;});
  const limits=$derived.by(()=>{const values=points.map(p=>p.value);if(costCents)values.push(costCents);const min=Math.min(...values),max=Math.max(...values),padding=Math.max(2,(max-min)*.15);return{min:Math.max(0,min-padding),max:max+padding};});
  const y=(value:number)=>258-(value-limits.min)/(limits.max-limits.min||1)*220;
  const x=(i:number,n:number)=>66+(n<=1?.5:i/(n-1))*(right-78);
  const line=$derived(points.map((p,i)=>(i?'L':'M')+x(i,points.length)+','+y(p.value)).join(' '));
  const area=$derived(points.length>1?line+' L'+x(points.length-1,points.length)+',258 L66,258 Z':'');
  const rising=$derived((points[points.length-1]?.value??0)>=(points[0]?.value??0));
</script>
<div class="chart-shell" use:fitChart>
  {#if points.length}
    <svg viewBox={'0 0 '+chartWidth+' 304'} role="img" aria-label={mode==='daily'?'实际行情按日聚合K线':'每六小时更新的实际价格走势'}>
      <defs><linearGradient id="stock-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color={rising?'#f07178':'#49c6a4'} stop-opacity=".22"/><stop offset="100%" stop-color={rising?'#f07178':'#49c6a4'} stop-opacity="0"/></linearGradient></defs>
      {#each [0,1,2,3,4] as i}
        {@const value=limits.min+(limits.max-limits.min)*i/4}
        <line x1="66" x2={right} y1={y(value)} y2={y(value)} stroke="#263240" stroke-dasharray="3 5"/>
        <text x="53" y={y(value)+4} text-anchor="end" fill="#8796a8" font-size="12">{(value/100).toFixed(2)}</text>
      {/each}
      {#if costCents}
        <line x1="66" x2={right} y1={y(costCents)} y2={y(costCents)} stroke="#dfb66a" stroke-dasharray="5 5"/>
        <text x={right-4} y={y(costCents)-6} text-anchor="end" fill="#dfb66a" font-size="11">持仓成本 {(costCents/100).toFixed(2)}</text>
      {/if}
      {#if mode==='trend'}
        <path d={area} fill="url(#stock-fill)"/>
        <path d={line} fill="none" stroke={rising?'#f07178':'#49c6a4'} stroke-width="2.5" stroke-linejoin="round"/>
        {#each points as point,i}<circle cx={x(i,points.length)} cy={y(point.value)} r={points.length>30?1.6:3.2} fill={rising?'#f07178':'#49c6a4'}><title>{stockTimeLabel(point.minute)} · {(point.value/100).toFixed(2)} 元</title></circle>{/each}
      {:else}
        {#each bars as bar,i}
          {@const color=bar.close>=bar.open?'#f07178':'#49c6a4'}
          {@const width=Math.min(20,(right-78)*.7/Math.max(1,bars.length))}
          <line x1={x(i,bars.length)} x2={x(i,bars.length)} y1={y(bar.high)} y2={y(bar.low)} stroke={color} stroke-width="2"/>
          <rect x={x(i,bars.length)-width/2} y={Math.min(y(bar.open),y(bar.close))} width={width} height={Math.max(2,Math.abs(y(bar.open)-y(bar.close)))} fill={bar.close>=bar.open?'#17212c':color} stroke={color} stroke-width="1.5"><title>开 {(bar.open/100).toFixed(2)} / 高 {(bar.high/100).toFixed(2)} / 低 {(bar.low/100).toFixed(2)} / 收 {(bar.close/100).toFixed(2)}</title></rect>
        {/each}
      {/if}
      <text x="66" y="288" fill="#8796a8" font-size="11">{stockTimeLabel(points[0].minute)}</text>
      <text x={right} y="288" text-anchor="end" fill="#8796a8" font-size="11">{stockTimeLabel(points[points.length-1]!.minute)}</text>
    </svg>
    {#if points.length===1}<div class="empty-chart">行情正在积累 · 下一次更新后显示走势</div>{/if}
  {/if}
</div>
<style>
.chart-shell{position:relative;min-height:150px;display:flex;align-items:center;flex:1}.chart-shell svg{display:block;width:100%;max-height:100%;font-family:ui-monospace,Consolas,monospace}.empty-chart{position:absolute;left:0;right:0;bottom:22%;text-align:center;color:#8e9cae;font-size:12px}
</style>
