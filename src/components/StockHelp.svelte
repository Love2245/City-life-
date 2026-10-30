<script lang="ts">
  let { topic, orderType }: { topic: string; orderType?: string } = $props();
  let dialog: HTMLDialogElement;
  const guides: Record<string, { title: string; principle: string; play: string; risk: string }> = {
    market: { title: '看行情', principle: '走势图记录这只股票过去的价格，公司消息显示近期动态。', play: '本次涨跌对比上次报价，今日涨跌对比当天起始价。可切换走势或日K，喜欢的股票可以加入自选。', risk: '行情每六小时更新。选择等待时，游戏时间和日常消耗也会照常推进。' },
    buy: { title: '普通买入', principle: '买入后持有股票，卖出时按买卖差价结算盈亏。', play: '把钱转入证券账户，选好股票，再填写股数或预算。买入后可在持仓里查看和卖出。', risk: '买卖都会收手续费，确认前可查看本笔费用。普通持股不收借款利息。' },
    sell: { title: '普通卖出', principle: '卖出持有的股票，扣除手续费后，钱会回到证券账户。', play: '选择持仓和股数，可以全部卖出，也可以只卖一部分。', risk: '已经挂卖单的股票暂时不能再卖，撤单后即可使用。成交后无法撤回。' },
    long: { title: '做多 · 看涨', principle: '先交一部分保证金，借钱买入更多股票。价格上涨时获利，下跌时亏损也会放大。', play: '选择倍数和股数，核对需要投入的保证金、费用和预计强平价。结束交易时，到持仓里平仓。', risk: '权益剩初始保证金的25%时会强平，跳价可能留下欠款。借入的资金按年化6%计息。' },
    short: { title: '做空 · 看跌', principle: '先借股票卖出，之后买回归还。买回价更低时获利，更高时亏损。', play: '选择倍数和股数并交付保证金。要结束交易时，到持仓里买回平仓；卖出所得暂时不能取用。', risk: '权益剩初始保证金的25%时会强平，跳涨可能留下欠款。借券费用按年化6%计算。' },
    close: { title: '平仓', principle: '平仓就是结束一笔保证金交易，结算盈亏、利息和手续费，剩余的钱退回账户。', play: '选中仓位并填写要结束的股数，可全部或部分平仓。做多用卖出结束，做空用买回结束。', risk: '亏损超过保证金时会留下欠款。同一仓位的挂单和止损会随平仓同步调整。' },
    marketOrder: { title: '市价交易', principle: '按屏幕上的当前报价立即成交。', play: '填好股数或预算，核对金额后确认。', risk: '成交后无法撤单。' },
    limit: { title: '挂单与撤单', principle: '先设好想买或想卖的价格，到了合适的报价再自动成交。', play: '买入会等价格降到指定价或更低，卖出则等价格涨到指定价或更高。不想等了，可在当前委托里撤单。', risk: '挂单会暂时占用资金或股票，撤单后释放。离开电脑仍然有效，成交后不能撤回。' },
    stop: { title: '止损与强平', principle: '止损会在价格触及设定值时帮你结束持仓。做空的止损方向与买入相反。', play: '在持仓里填写止损价并保存，取消即可解除。保证金不足时，系统也可能自动强制平仓。', risk: '止损按触发时的实际价格成交。价格跳动较大时，亏损可能超出预期。' },
    transfer: { title: '转入与转出', principle: '证券账户里的钱用来交易，生活现金用来日常花销。', play: '填写金额，选择转入证券或转回生活。', risk: '挂单占用的资金、保证金和未结清借款不能转出。' },
    deposit: { title: '定期存款', principle: '存入一笔钱，按持有时间获得利息。', play: '填写金额存入，之后可在下方理财列表里查看和赎回。', risk: '利息按月结算。存入和赎回都使用生活现金。' },
    legacy: { title: '其他理财', principle: '这里保留之前持有的存款、基金和股票，继续按各自方式结算。', play: '查看当前价值，选择赎回即可转回生活现金。基金和旧股票只支持赎回。', risk: '这些资产单独结算，不使用新股票的挂单和止损。' },
    loan: { title: '抵押借款', principle: '用名下完整拥有的房屋或买断车辆作抵押，将借款转入证券账户。', play: '勾选抵押物，按显示的额度填写金额，再查看借款确认。结清后会解除抵押。', risk: '贷款30天到期，逾期加息并有14天宽限，之后可能变卖房车偿债。贷款和保证金交易不能同时使用。' },
    repay: { title: '还款', principle: '先还利息，再还本金。还款先用证券可用资金，不足时再用生活现金。', play: '填写金额分次还款，或选择尽力还清。也可以先卖出投资，再回来还款。', risk: '部分还款不会延长截止日期。逾期或穿仓欠款未清时，暂停新增买入和转出资金。' }
  };
  const guide = $derived(guides[topic] ?? guides.buy);
  const orderGuide = $derived(orderType ? guides[orderType === 'limit' ? 'limit' : 'marketOrder'] : null);
</script>

<div class="help-note"><button class="help-trigger" onclick={() => dialog.showModal()}>ⓘ {guide.title} · 玩法说明</button></div>
<dialog bind:this={dialog} class="stock-help" aria-label={guide.title + '玩法说明'} onclick={event => { if (event.target === dialog) dialog.close(); }} onkeydown={event => { if (event.key === 'Escape') dialog.close(); }}>
  <div class="help-content">
    <header><h2>{guide.title}</h2><button aria-label="关闭玩法说明" onclick={() => dialog.close()}>×</button></header>
    <div class="help-body"><p class="guide-summary">{guide.principle}</p><h3>怎么操作</h3><p>{guide.play}</p>{#if orderGuide}<h3>本次：{orderGuide.title}</h3><p>{orderGuide.principle} {orderGuide.play}</p>{/if}<p class="guide-note">{guide.risk}{orderGuide ? ' ' + orderGuide.risk : ''}</p></div>
    <footer><button onclick={() => dialog.close()}>明白了</button></footer>
  </div>
</dialog>

<style>
  .help-note{margin-top:10px;padding-top:7px;border-top:1px dashed #354353}
  .help-trigger{font:inherit;font-size:11px;line-height:1.6;text-align:left;color:#b8a17d;background:transparent;border:0;padding:5px 0;cursor:pointer}
  .help-trigger:hover{color:#f1d099}.help-trigger:focus-visible,.stock-help button:focus-visible{outline:2px solid #e7bb70;outline-offset:3px}
  .stock-help{color:#e5ebf2;background:#17212c;border:1px solid #596276;border-radius:12px;padding:0;width:min(480px,calc(100vw - 24px));max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px);box-shadow:0 20px 70px #0009;font-family:"Segoe UI","Microsoft YaHei",sans-serif}
  .stock-help::backdrop{background:#050b13b8}.help-content{display:flex;flex-direction:column;max-height:calc(100dvh - 26px)}
  header{display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid #354353;gap:14px}h2{margin:0;font-size:18px;color:#edca91}header button{font-size:25px;background:transparent;border:0;color:#b7c6d7;cursor:pointer;padding:0 5px}
  .help-body{overflow:auto;padding:4px 20px 10px}h3{font-size:13px;color:#edca91;margin:14px 0 5px}p{font-size:13px;line-height:1.85;margin:0;color:#c6d2df}.guide-summary{padding-top:12px}.guide-note{margin-top:16px;padding-top:12px;border-top:1px solid #354353;color:#a8b6c7;font-size:12px}footer{padding:12px 20px;border-top:1px solid #354353;text-align:right}footer button{font:inherit;font-size:13px;padding:8px 24px;background:#e7bb70;color:#302113;border:0;border-radius:6px;cursor:pointer}
  @media(max-width:960px){.help-trigger{font-size:13px;min-height:40px}header{padding:10px 16px}.help-body{padding:0 16px 8px}footer{padding:8px 16px}footer button{min-height:40px}}
</style>
