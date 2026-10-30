<script lang="ts">
  import {onMount} from 'svelte';
  import {gameState} from '../../stores/gameStore.svelte';
  import {uiState,closeModal,showToast,presentJobResult} from '../../stores/uiStore.svelte';
  import {visibleActionsAtLocation,getLocation,facilityPurchaseCheck,purchasePriceOf,performShoppingCart,DINE_IN_EXTRA_HOURS} from '../../game/core/actions';
  import {isFacilityProduct,productCategory,productRepeatable,productFamily,shoppingDuration,type ShoppingLine} from '../../game/core/facilityShopping';
  import {getItem,itemCount} from '../../game/core/items';
  import {formatMoney} from '../../lib/format';
  import {formatDuration} from '../../game/core/quests';
  let category=$state('全部'),query=$state(''),cart=$state<ShoppingLine[]>([]),busy=$state(false),dine=$state<'pack'|'eat'>('pack');
  const location=gameState.locationId;
  const products=$derived(visibleActionsAtLocation(gameState,location).filter(a=>a.locationId===location&&isFacilityProduct(a)));
  const categories=$derived(['全部',...new Set(products.map(productCategory))]);
  const visible=$derived(products.filter(a=>(category==='全部'||productCategory(a)===category)&&`${getItem(a.itemId!)?.name} ${a.desc??''}`.includes(query.trim())));
  const lines=$derived(cart.map(line=>({...line,action:products.find(a=>a.id===line.actionId)})).filter(l=>!!l.action));
  const units=$derived(lines.reduce((n,l)=>n+l.quantity,0));
  const total=$derived(lines.reduce((n,l)=>n+purchasePriceOf(gameState,l.action!)*l.quantity,0));
  const hasReadyFood=$derived(lines.some(l=>['buy_food','buy_fresh'].includes(l.action!.handler??'')));
  const duration=$derived(shoppingDuration(lines.map(l=>l.action!),units)+(hasReadyFood&&dine==='eat'?DINE_IN_EXTRA_HOURS:0));
  const canCheckout=$derived(units>0&&units<=99&&total<=gameState.player.money&&lines.every(l=>facilityPurchaseCheck(gameState,l.action!).ok));
  const selected=(id:string)=>cart.find(l=>l.actionId===id)?.quantity??0;
  function setQuantity(id:string,quantity:number){
    const action=products.find(a=>a.id===id);if(!action)return;
    const maximum=productRepeatable(action)?99:1,q=Math.max(0,Math.min(maximum,quantity)),family=productFamily(action);
    cart=cart.filter(l=>l.actionId!==id&&(!q||!family||productFamily(products.find(a=>a.id===l.actionId)!)!==family));
    if(q)cart=[...cart,{actionId:id,quantity:q}];
  }
  function checkout(){
    if(busy||uiState.modal!=='facility_shop'||gameState.locationId!==location)return;
    busy=true;const result=performShoppingCart(gameState,cart,{dine:hasReadyFood?dine:'pack'});
    if(!result.ok){busy=false;showToast(result.reason??'本次采购未完成');return;}
    cart=[];closeModal();if(result.result)presentJobResult(result.result,undefined,{id:result.result.actionId,name:result.result.name,icon:result.result.icon});
  }
  onMount(()=>{document.querySelector<HTMLButtonElement>('[data-close-shop]')?.focus();});
  $effect(()=>{if(gameState.locationId!==location&&uiState.modal==='facility_shop')closeModal();});
</script>

<div class="overlay hud-scope retail-overlay" role="presentation" onclick={(e)=>{if(e.target===e.currentTarget)closeModal();}}>
  <div class="retail-modal" role="dialog" aria-modal="true" aria-label="商店采购" tabindex="-1">
    <header class="retail-header"><div><span class="eyebrow">商品目录</span><h2>{getLocation(location)?.name??'商店'}<small>选购与结算</small></h2></div><div class="retail-wallet">可用资金<strong>¥ {formatMoney(gameState.player.money)}</strong></div><button class="close-shop" data-close-shop aria-label="关闭采购目录" onclick={()=>closeModal()}>×</button></header>
    <div class="retail-body">
      <div class="retail-browser">
        <label class="retail-search"><span>搜索商品</span><input type="search" placeholder="商品名称或用途" bind:value={query}/></label>
        <nav class="retail-categories" aria-label="采购商品分类">{#each categories as cat}<button class:active={category===cat} aria-pressed={category===cat} onclick={()=>category=cat}>{cat}</button>{/each}</nav>
        <p class="retail-hint">分类之间共用一份清单，选好后一起结算。食品默认打包。</p>
        <div class="retail-products">{#each visible as action (action.id)}
          {@const item=getItem(action.itemId!)!}{@const check=facilityPurchaseCheck(gameState,action)}{@const quantity=selected(action.id)}
          <article class="retail-product" class:selected={quantity>0} data-shop-product={action.id}>
            <span class="product-icon" aria-hidden="true">{item.icon}</span><div class="product-copy"><h3>{item.name}</h3><p>{item.desc??action.desc}</p><div class="product-meta"><span>¥ {formatMoney(purchasePriceOf(gameState,action))}</span><small>{action.itemQuantity&&action.itemQuantity>1?`每份 ${action.itemQuantity} 件 · `:''}已持有 {itemCount(gameState,item.id)}</small></div>{#if !check.ok}<small class="unavailable-reason">{check.reason}</small>{/if}</div>
            <div class="quantity-control" role="group" aria-label={`${item.name}数量`}><button aria-label={`减少${item.name}`} disabled={!quantity||busy} onclick={()=>setQuantity(action.id,quantity-1)}>−</button><output aria-label={`${item.name}已选数量`}>{quantity}</output><button aria-label={`添加${item.name}`} disabled={!check.ok||busy||quantity>=(productRepeatable(action)?99:1)} onclick={()=>setQuantity(action.id,quantity+1)}>＋</button></div>
          </article>
        {:else}<div class="retail-empty">没有找到这类商品。<button onclick={()=>{query='';category='全部';}}>查看全部商品</button></div>{/each}</div>
      </div>
      <aside class="retail-cart" aria-label="本次采购清单"><div class="cart-heading"><h3>本次采购</h3><button disabled={!cart.length} onclick={()=>cart=[]}>清空</button></div>
        <div class="cart-lines">{#each lines as line (line.actionId)}<div class="cart-line" data-cart-line={line.actionId}><div><strong>{getItem(line.action!.itemId!)?.name}</strong><span>{line.quantity} 份 · ¥ {formatMoney(purchasePriceOf(gameState,line.action!)*line.quantity)}</span></div><button aria-label={`移除${getItem(line.action!.itemId!)?.name}`} onclick={()=>setQuantity(line.actionId,0)}>×</button></div>{:else}<p class="cart-empty">清单还是空的。<br/>点击商品旁的“＋”加入。</p>{/each}</div>
        <footer class="cart-total"><span>{lines.length} 种商品 · 共 {units} 份</span>{#if hasReadyFood}<div class="dine-choice" role="group" aria-label="采购取用方式"><button class:active={dine==='pack'} aria-pressed={dine==='pack'} onclick={()=>dine='pack'}>打包带走</button><button class:active={dine==='eat'} aria-pressed={dine==='eat'} onclick={()=>dine='eat'}>店内用餐</button></div>{/if}<div>合计<strong>¥ {formatMoney(total)}</strong></div><p>{duration>0?`本次采购合并耗时 ${formatDuration(duration)}`:'本次打包不消耗时间'}</p><button class="checkout-button" data-checkout-shop disabled={!canCheckout||busy} onclick={checkout}>{busy?'正在结算':units===0?'先选择商品':units>99?'最多选择99份':total>gameState.player.money?'余额不足':'结算采购'}</button></footer>
      </aside>
    </div>
  </div>
</div>

<style>
  .retail-overlay{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:20px;background:#08151cb5;backdrop-filter:blur(7px)}.retail-modal{width:min(1040px,100%);height:min(760px,100%);display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--hud-border);border-radius:18px;background:var(--hud-surface);color:var(--text-main);box-shadow:0 24px 70px #0006}
  .retail-header{display:flex;align-items:center;gap:20px;padding:20px 24px;border-bottom:1px solid var(--hud-border);flex:none}.eyebrow{font-size:11px;letter-spacing:.1em;color:var(--accent-2)}h2{font-size:22px;margin:5px 0 0;line-height:1.3}h2 small{font-size:12px;color:var(--text-dim);font-weight:400;margin-left:14px}.retail-wallet{margin-left:auto;font-size:11px;color:var(--text-dim)}.retail-wallet strong{display:block;margin-top:4px;font-size:18px;color:var(--accent)}button,input{font:inherit;color:inherit}button{cursor:pointer;border:1px solid var(--hud-border);border-radius:8px;background:color-mix(in srgb,var(--hud-text) 5%,transparent);min-height:36px}button:disabled{opacity:.45;cursor:default}button:hover:not(:disabled){border-color:var(--accent-2);background:color-mix(in srgb,var(--accent-2) 12%,transparent)}.close-shop{width:36px;font-size:23px;flex:none}
  .retail-body{display:grid;grid-template-columns:minmax(0,1fr) 285px;flex:1;min-height:0}.retail-browser{display:flex;flex-direction:column;min-width:0;min-height:0;padding:18px 20px}.retail-search{display:flex;align-items:center;gap:12px;font-size:11px;color:var(--text-dim);flex:none}.retail-search>span{white-space:nowrap;flex:none}.retail-search input{width:100%;min-width:0;min-height:38px;border-radius:9px;border:1px solid var(--hud-border);background:var(--hud-surface-solid);padding:9px 12px;color:var(--text-main)}.retail-categories{display:flex;gap:5px;overflow-x:auto;scrollbar-width:thin;margin-top:12px;flex:none;padding-bottom:3px}.retail-categories button{white-space:nowrap;flex:none;padding:7px 12px;font-size:12px}.retail-categories .active{background:color-mix(in srgb,var(--accent) 14%,transparent);border-color:var(--accent);color:var(--accent)}.retail-hint{font-size:11px;color:var(--text-dim);margin:10px 0;flex:none;line-height:1.5}.retail-products{overflow:auto;overscroll-behavior:contain;min-height:0;flex:1;padding-right:5px;scrollbar-width:thin}
  .retail-product{display:flex;align-items:center;gap:12px;padding:13px 12px;margin-bottom:8px;background:color-mix(in srgb,var(--hud-text) 4%,transparent);border:1px solid var(--hud-border);border-radius:11px}.retail-product.selected{border-color:color-mix(in srgb,var(--accent) 55%,var(--hud-border));background:color-mix(in srgb,var(--accent) 6%,transparent)}.product-icon{font-size:27px;width:36px;text-align:center;flex:none}.product-copy{min-width:0;flex:1}h3{margin:0;font-size:14px;font-weight:600}.product-copy p{font-size:11px;color:var(--text-dim);line-height:1.6;margin:5px 0;overflow-wrap:anywhere}.product-meta{display:flex;gap:14px;align-items:center;flex-wrap:wrap}.product-meta>span{font-size:13px;color:var(--accent);font-variant-numeric:tabular-nums}.product-meta small,.unavailable-reason{font-size:10px;color:var(--text-dim)}.unavailable-reason{display:block;margin-top:5px;color:var(--warn)}.quantity-control{display:flex;align-items:center;gap:4px;flex:none}.quantity-control button{width:33px;font-size:18px}.quantity-control output{font-size:13px;min-width:22px;text-align:center;font-variant-numeric:tabular-nums}
  .retail-cart{display:flex;flex-direction:column;min-height:0;padding:18px;border-left:1px solid var(--hud-border);background:color-mix(in srgb,var(--hud-surface-solid) 72%,transparent)}.cart-heading{display:flex;align-items:center;justify-content:space-between;gap:10px}.cart-heading button{font-size:11px;padding:6px 10px}.cart-lines{flex:1;min-height:0;overflow:auto;scrollbar-width:thin;margin:15px 0}.cart-line{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--hud-border)}.cart-line>div{flex:1;min-width:0}.cart-line strong{font-size:12px;font-weight:500;display:block}.cart-line span{display:block;font-size:11px;color:var(--text-dim);margin-top:4px}.cart-line button{width:30px;font-size:17px}.cart-empty{color:var(--text-dim);font-size:12px;line-height:1.8;padding:30px 8px;text-align:center}.cart-total{flex:none;border-top:1px solid var(--hud-border);padding-top:15px}.cart-total>span{color:var(--text-dim);font-size:11px}.cart-total>div{display:flex;align-items:center;justify-content:space-between;margin:10px 0;font-size:13px}.cart-total strong{color:var(--accent);font-size:22px;font-variant-numeric:tabular-nums}.cart-total p{font-size:11px;color:var(--text-dim);margin:0 0 12px}.cart-total .checkout-button{width:100%;background:var(--accent);color:var(--accent-ink);border-color:var(--accent);font-size:13px;font-weight:600;min-height:42px}.retail-empty{padding:30px;text-align:center;color:var(--text-dim);font-size:13px}.retail-empty button{display:block;margin:15px auto;padding:8px 16px}
  :global(:root[data-game-mode="mobile"]) .retail-overlay{padding:8px}:global(:root[data-game-mode="mobile"]) .retail-modal{height:100%}:global(:root[data-game-mode="mobile"]) .retail-header{padding:10px 14px}:global(:root[data-game-mode="mobile"]) .retail-header h2{font-size:var(--m-fs-lg)}:global(:root[data-game-mode="mobile"]) .retail-header h2 small{display:none}:global(:root[data-game-mode="mobile"]) button{min-height:var(--m-tap)}:global(:root[data-game-mode="mobile"]) .quantity-control button{min-width:var(--m-tap)}:global(:root[data-game-mode="mobile"]) .product-copy h3{font-size:var(--m-fs-md)}:global(:root[data-game-mode="mobile"]) .product-copy p,:global(:root[data-game-mode="mobile"]) .retail-hint{font-size:var(--m-fs-xs)}
  @media(max-height:520px) and (min-width:650px){.retail-header{padding:10px 16px}.retail-body{grid-template-columns:minmax(0,1fr) 230px}.retail-browser{padding:10px 12px}.retail-cart{padding:10px 12px}.retail-search input{min-height:32px;padding:6px 10px}.retail-categories{margin-top:7px}.retail-hint{margin:5px 0}.cart-lines{margin:7px 0}.cart-total{padding-top:8px}.cart-total p{margin-bottom:6px}}
  @media(max-width:649px){.retail-body{grid-template-columns:1fr;grid-template-rows:minmax(0,1fr) auto}.retail-header{gap:10px;padding:12px}.retail-wallet strong{font-size:14px}h2{font-size:18px}h2 small{display:none}.retail-browser{padding:12px}.retail-cart{border-left:0;border-top:1px solid var(--hud-border);padding:10px 14px;max-height:240px}.cart-heading{display:none}.cart-lines{max-height:80px;margin:0}.cart-empty{display:none}.cart-total{padding-top:8px}.cart-total>div{margin:5px 0}.cart-total p{margin-bottom:6px}.product-icon{display:none}.quantity-control{gap:2px}}
  .cart-total .dine-choice{display:flex;gap:5px}.dine-choice button{flex:1;font-size:11px;padding:5px}.dine-choice .active{border-color:var(--accent-2);color:var(--accent-2);background:color-mix(in srgb,var(--accent-2) 10%,transparent)}
</style>
