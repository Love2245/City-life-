// assets/charts.js
(function () {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim();
  var accent2 = style.getPropertyValue('--accent2').trim();
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();

  // --- Chart: 稀有度分布 ---
  var el1 = document.getElementById('chart-rarity');
  if (el1 && typeof echarts !== 'undefined') {
    var c1 = echarts.init(el1, null, { renderer: 'svg' });
    c1.setOption({
      animation: false,
      tooltip: { trigger: 'axis', appendToBody: true },
      grid: { left: 48, right: 24, top: 30, bottom: 40 },
      xAxis: {
        type: 'category',
        data: ['普通', '稀有', '超稀有', '传说', 'Boss'],
        axisLine: { lineStyle: { color: rule } },
        axisLabel: { color: muted },
        axisTick: { show: false }
      },
      yAxis: {
        type: 'value',
        name: '猫种数',
        nameTextStyle: { color: muted },
        axisLine: { lineStyle: { color: rule } },
        axisLabel: { color: muted },
        splitLine: { lineStyle: { color: rule } }
      },
      series: [{
        type: 'bar',
        data: [3, 2, 2, 1, 1],
        itemStyle: { color: accent, borderRadius: [4, 4, 0, 0] },
        barWidth: '42%',
        label: { show: true, color: ink, position: 'top' }
      }]
    });
    window.addEventListener('resize', function () { c1.resize(); });
  }

  // --- Chart: 属性成长曲线 ---
  var el2 = document.getElementById('chart-growth');
  if (el2 && typeof echarts !== 'undefined') {
    var c2 = echarts.init(el2, null, { renderer: 'svg' });
    var lv = [], hp = [], atk = [], spd = [];
    for (var i = 1; i <= 30; i++) {
      lv.push(i);
      hp.push(Math.round(40 + i * 4 + Math.pow(i, 1.4)));
      atk.push(Math.round(10 + i * 1.6 + Math.pow(i, 1.1)));
      spd.push(Math.round(8 + i * 1.2));
    }
    c2.setOption({
      animation: false,
      tooltip: { trigger: 'axis', appendToBody: true },
      legend: { data: ['HP', '攻击', '速度'], textStyle: { color: muted }, top: 0 },
      grid: { left: 48, right: 24, top: 44, bottom: 44 },
      xAxis: {
        type: 'category',
        data: lv,
        name: '等级',
        nameTextStyle: { color: muted },
        axisLine: { lineStyle: { color: rule } },
        axisLabel: { color: muted, interval: 4 },
        axisTick: { show: false }
      },
      yAxis: {
        type: 'value',
        name: '数值',
        nameTextStyle: { color: muted },
        axisLine: { lineStyle: { color: rule } },
        axisLabel: { color: muted },
        splitLine: { lineStyle: { color: rule } }
      },
      series: [
        { name: 'HP', type: 'line', data: hp, smooth: true, symbol: 'none', itemStyle: { color: accent }, lineStyle: { color: accent, width: 2 } },
        { name: '攻击', type: 'line', data: atk, smooth: true, symbol: 'none', itemStyle: { color: accent2 }, lineStyle: { color: accent2, width: 2 } },
        { name: '速度', type: 'line', data: spd, smooth: true, symbol: 'none', itemStyle: { color: muted }, lineStyle: { color: muted, width: 2 } }
      ]
    });
    window.addEventListener('resize', function () { c2.resize(); });
  }
})();
