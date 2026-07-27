(function () {
  const tradesUrl = 'data/trades.json';

  const metaSymbol = document.getElementById('meta-symbol');
  const metaAccount = document.getElementById('meta-account');
  const metaGenerated = document.getElementById('meta-generated');

  const kpiNetPnl = document.getElementById('kpi-netpnl');
  const kpiTrades = document.getElementById('kpi-trades');
  const kpiPf = document.getElementById('kpi-pf');
  const kpiWinrate = document.getElementById('kpi-winrate');
  const kpiWinrateDetail = document.getElementById('kpi-winrate-detail');
  const kpiAvgWlText = document.getElementById('kpi-avgwl-text');

  const barAvgLoss = document.getElementById('bar-avg-loss');
  const barAvgWin = document.getElementById('bar-avg-win');

  const calendarMonthLabel = document.getElementById('calendar-month-label');
  const calendarDaysContainer = document.getElementById('calendar-days');
  const calendarWeeksContainer = document.getElementById('calendar-weeks');
  const monthPrevBtn = document.getElementById('month-prev');
  const monthNextBtn = document.getElementById('month-next');

  const perfScoreValue = document.getElementById('perf-score-value');
  const perfMetricsList = document.getElementById('perf-metrics-list');

  const themeToggleBtn = document.getElementById('theme-toggle');

  let profitFactorChart = null;
  let performanceRadarChart = null;

  let allTrades = [];
  let currentMonth = null; // Date at first of month

  function formatCurrency(value) {
    if (!isFinite(value)) return '\u2014';
    const sign = value >= 0 ? '' : '-';
    const abs = Math.abs(value);
    return sign + '$' + abs.toFixed(2);
  }

  function formatPercent(v, decimals = 0) {
    if (!isFinite(v)) return '\u2014';
    return v.toFixed(decimals) + '%';
  }

  function groupByDay(trades) {
    const map = new Map();
    for (const t of trades) {
      const day = t.day;
      if (!day) continue;
      if (!map.has(day)) map.set(day, []);
      map.get(day).push(t);
    }
    return map;
  }

  function computeMetrics(trades) {
    const totalTrades = trades.length;
    let netPnl = 0;
    let wins = 0;
    let losses = 0;
    let grossWins = 0;
    let grossLosses = 0;

    for (const t of trades) {
      const pnl = Number(t.pnl) || 0;
      netPnl += pnl;
      if (pnl > 0) {
        wins += 1;
        grossWins += pnl;
      } else if (pnl < 0) {
        losses += 1;
        grossLosses += pnl; // negative
      }
    }

    const profitFactor = grossLosses === 0 ? (grossWins > 0 ? Infinity : 0) : grossWins / Math.abs(grossLosses);
    const winRate = totalTrades === 0 ? 0 : (wins / totalTrades) * 100;

    const avgWin = wins ? grossWins / wins : 0;
    const avgLoss = losses ? grossLosses / losses : 0; // negative

    const dayMap = groupByDay(trades);
    const days = Array.from(dayMap.keys()).sort();
    const dailyPnls = [];
    const runningEquity = [];
    let equity = 0;
    let maxEquity = 0;
    let maxDrawdown = 0;

    for (const d of days) {
      const dayTrades = dayMap.get(d) || [];
      const dayPnl = dayTrades.reduce((sum, t) => sum + (Number(t.pnl) || 0), 0);
      dailyPnls.push({ day: d, pnl: dayPnl });
      equity += dayPnl;
      runningEquity.push({ day: d, equity });
      if (equity > maxEquity) maxEquity = equity;
      const drawdown = maxEquity - equity;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    const equityPeak = maxEquity;
    const equityValley = equityPeak - maxDrawdown;

    // Recovery metric: netPnl relative to max drawdown
    const recovery = netPnl > 0 && maxDrawdown > 0
      ? Math.min(netPnl / Math.max(Math.abs(maxDrawdown), 1) / 2, 1) * 100
      : 0;

    // Drawdown metric: 100 is best (small drawdown)
    const drawdownScore = 100 - Math.min(maxDrawdown / 500, 1) * 100;

    // Consistency: based on stddev of daily pnl
    const dailyValues = dailyPnls.map(d => d.pnl);
    let std = 0;
    if (dailyValues.length > 1) {
      const mean = dailyValues.reduce((a, b) => a + b, 0) / dailyValues.length;
      const variance = dailyValues.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (dailyValues.length - 1);
      std = Math.sqrt(variance);
    }
    const consistency = 100 - Math.min(std / 300, 1) * 100;

    const avgWinLossRatio = (avgWin > 0 && avgLoss < 0) ? (avgWin / Math.abs(avgLoss)) : 0;

    const metrics = {
      totalTrades,
      netPnl,
      wins,
      losses,
      grossWins,
      grossLosses,
      profitFactor,
      winRate,
      avgWin,
      avgLoss,
      dailyPnls,
      runningEquity,
      maxDrawdown,
      equityPeak,
      equityValley,
      performanceAxes: {
        winPct: winRate,
        profitFactor: Math.min(profitFactor / 3, 1) * 100,
        avgWinLoss: Math.min(avgWinLossRatio / 3, 1) * 100,
        recovery,
        drawdown: drawdownScore,
        consistency,
      },
    };

    metrics.overallScore = Object.values(metrics.performanceAxes).reduce((a, b) => a + b, 0) /
      Object.values(metrics.performanceAxes).length;

    return metrics;
  }

  function updateKpis(metrics) {
    const { netPnl, totalTrades, profitFactor, winRate, wins, losses, avgWin, avgLoss } = metrics;

    kpiNetPnl.textContent = formatCurrency(netPnl);
    kpiNetPnl.classList.remove('netpnl-positive', 'netpnl-negative');
    if (netPnl > 0) kpiNetPnl.classList.add('netpnl-positive');
    else if (netPnl < 0) kpiNetPnl.classList.add('netpnl-negative');

    kpiTrades.textContent = `${totalTrades} trade${totalTrades === 1 ? '' : 's'}`;

    if (!isFinite(profitFactor)) {
      kpiPf.textContent = profitFactor === Infinity ? '∞' : '\u2014';
    } else {
      kpiPf.textContent = profitFactor.toFixed(2);
    }

    kpiWinrate.textContent = formatPercent(winRate, 0);
    kpiWinrateDetail.textContent = `${wins}w / ${losses}l`;

    const winLabel = wins ? formatCurrency(avgWin) : 'N/A';
    const lossLabel = losses ? formatCurrency(avgLoss) : 'N/A';
    kpiAvgWlText.textContent = `Win ${winLabel} / Loss ${lossLabel}`;

    const maxMagnitude = Math.max(avgWin || 0, Math.abs(avgLoss) || 0) || 1;
    const winWidth = wins ? (avgWin / maxMagnitude) * 50 : 0;
    const lossWidth = losses ? (Math.abs(avgLoss) / maxMagnitude) * 50 : 0;

    barAvgWin.style.width = `${winWidth}%`;
    barAvgLoss.style.width = `${lossWidth}%`;
  }

  function updateProfitFactorChart(metrics) {
    const { grossWins, grossLosses } = metrics;
    const ctx = document.getElementById('chart-profit-factor').getContext('2d');

    const winVal = Math.max(grossWins, 0);
    const lossVal = Math.abs(Math.min(grossLosses, 0));

    if (profitFactorChart) {
      profitFactorChart.data.datasets[0].data = [winVal, lossVal];
      profitFactorChart.update();
      return;
    }

    profitFactorChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Win $', 'Loss $'],
        datasets: [{
          data: [winVal, lossVal],
          backgroundColor: ['#22c55e', '#ef4444'],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label(context) {
                const label = context.label || '';
                const val = context.parsed;
                return `${label}: ${formatCurrency(val)}`;
              },
            },
          },
        },
        cutout: '65%',
      },
    });
  }

  function updateGauge(winRate) {
    const track = document.querySelector('.gauge-track');
    const fill = document.querySelector('.gauge-fill');
    const needle = document.querySelector('.gauge-needle');

    if (!track || !fill || !needle) return;

    const r = 40;
    const angle = Math.PI; // 180 degrees
    const arcLength = r * angle;
    const dash = (winRate / 100) * arcLength;
    fill.style.strokeDasharray = `${dash} ${arcLength}`;

    const rotation = -90 + (winRate / 100) * 180;
    needle.style.transform = `rotate(${rotation}deg)`;
  }

  function getMonthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function buildCalendar(trades) {
    if (!currentMonth) currentMonth = new Date();
    const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const lastDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

    const monthFormatter = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
    calendarMonthLabel.textContent = monthFormatter.format(firstDay);

    const dayMap = groupByDay(trades);

    calendarDaysContainer.innerHTML = '';
    if (calendarWeeksContainer) calendarWeeksContainer.innerHTML = '';

    const startOffset = firstDay.getDay(); // 0-6
    const totalDays = lastDay.getDate();

    const rows = [];
    let currentRow = [];

    for (let i = 0; i < startOffset; i++) {
      currentRow.push(null);
    }

    for (let d = 1; d <= totalDays; d++) {
      const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), d);
      currentRow.push(date);
      if (currentRow.length === 7 || d === totalDays) {
        rows.push(currentRow);
        currentRow = [];
      }
    }

    rows.forEach((week, weekIndex) => {
      let weekPnl = 0;
      let weekDays = 0;

      week.forEach(date => {
        const cell = document.createElement('div');
        cell.className = 'calendar-day';

        if (!date) {
          cell.classList.add('empty');
          calendarDaysContainer.appendChild(cell);
          return;
        }

        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        const key = `${yyyy}-${mm}-${dd}`;

        const tradesForDay = dayMap.get(key) || [];
        const dayPnl = tradesForDay.reduce((s, t) => s + (Number(t.pnl) || 0), 0);

        const dateEl = document.createElement('div');
        dateEl.className = 'calendar-day-date';
        dateEl.textContent = date.getDate();

        const pnlEl = document.createElement('div');
        pnlEl.className = 'calendar-day-pnl';
        pnlEl.textContent = tradesForDay.length ? formatCurrency(dayPnl) : '';

        if (tradesForDay.length) {
          if (dayPnl > 0) cell.classList.add('positive');
          else if (dayPnl < 0) cell.classList.add('negative');
          weekPnl += dayPnl;
          weekDays += 1;
          cell.classList.add('has-trades');
          cell.dataset.day = key;
          cell.addEventListener('click', () => openRecap(key));
        }

        cell.appendChild(dateEl);
        cell.appendChild(pnlEl);
        calendarDaysContainer.appendChild(cell);
      });

      // 8th column: week summary card, aligned to this row
      const wk = document.createElement('div');
      wk.className = 'calendar-week-cell';
      if (weekPnl > 0) wk.classList.add('positive');
      else if (weekPnl < 0) wk.classList.add('negative');

      const wkLabel = document.createElement('div');
      wkLabel.className = 'calendar-week-label';
      wkLabel.textContent = `Week ${weekIndex + 1}`;

      const wkPnl = document.createElement('div');
      wkPnl.className = 'calendar-week-pnl';
      wkPnl.textContent = formatCurrency(weekPnl || 0);

      const wkDays = document.createElement('div');
      wkDays.className = 'calendar-week-days';
      wkDays.textContent = `${weekDays} day${weekDays === 1 ? '' : 's'}`;

      wk.appendChild(wkLabel);
      wk.appendChild(wkPnl);
      wk.appendChild(wkDays);
      calendarDaysContainer.appendChild(wk);
    });
  }

  function updatePerformanceChart(metrics) {
    const axes = metrics.performanceAxes;
    const labels = ['Win %', 'Profit F.', 'Avg W/L', 'Recovery', 'Drawdown', 'Consistency'];
    const values = [
      axes.winPct,
      axes.profitFactor,
      axes.avgWinLoss,
      axes.recovery,
      axes.drawdown,
      axes.consistency,
    ];

    const ctx = document.getElementById('chart-performance').getContext('2d');

    if (performanceRadarChart) {
      performanceRadarChart.data.datasets[0].data = values;
      performanceRadarChart.update();
    } else {
      performanceRadarChart = new Chart(ctx, {
        type: 'radar',
        data: {
          labels,
          datasets: [{
            label: 'Performance',
            data: values,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.26)',
            pointBackgroundColor: '#e5e7eb',
            pointRadius: 3,
            borderWidth: 2,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            r: {
              min: 0,
              max: 100,
              ticks: { display: false },
              grid: { color: 'rgba(148, 163, 184, 0.3)' },
              angleLines: { color: 'rgba(148, 163, 184, 0.4)' },
            },
          },
        },
      });
    }

    perfScoreValue.textContent = Math.round(metrics.overallScore).toString();

    perfMetricsList.innerHTML = '';
    const pairs = [
      ['Win %', axes.winPct],
      ['Profit factor', axes.profitFactor],
      ['Avg W/L', axes.avgWinLoss],
      ['Recovery', axes.recovery],
      ['Drawdown', axes.drawdown],
      ['Consistency', axes.consistency],
    ];

    pairs.forEach(([label, value]) => {
      const li = document.createElement('li');
      li.className = 'perf-metric-item';
      const name = document.createElement('span');
      name.className = 'perf-metric-label';
      name.textContent = label;
      const val = document.createElement('span');
      val.className = 'perf-metric-value';
      val.textContent = `${value.toFixed(0)}%`;
      li.appendChild(name);
      li.appendChild(val);
      perfMetricsList.appendChild(li);
    });
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('rxt-theme', theme);
    } catch (_) {}
  }

  function initTheme() {
    let theme = 'light';
    try {
      const stored = localStorage.getItem('rxt-theme');
      if (stored === 'light' || stored === 'dark') theme = stored;
    } catch (_) {}
    applyTheme(theme);

    themeToggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      if (recapState.open) renderRecapChart(); // recolor open chart
    });
  }

  function loadTrades() {
    fetch(tradesUrl)
      .then(res => res.json())
      .then(data => {
        const { generated, symbol, account, trades } = data || {};
        allTrades = Array.isArray(trades) ? trades : [];

        metaSymbol.textContent = symbol || '—';
        metaAccount.textContent = account || '—';
        metaGenerated.textContent = generated || '—';

        if (!currentMonth) {
          let targetDate = new Date();
          if (allTrades.length) {
            const lastTrade = allTrades.reduce((a, b) => (a.day > b.day ? a : b));
            if (lastTrade && lastTrade.day) {
              const [y, m, d] = lastTrade.day.split('-').map(Number);
              const dt = new Date(y, (m || 1) - 1, d || 1);
              if (!isNaN(dt.getTime())) targetDate = dt;
            }
          }
          currentMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
        }

        const metrics = computeMetrics(allTrades);
        updateKpis(metrics);
        updateProfitFactorChart(metrics);
        updateGauge(metrics.winRate);
        buildCalendar(allTrades);
        updatePerformanceChart(metrics);

        // deep link: ?day=YYYY-MM-DD auto-opens that recap
        const qs = new URLSearchParams(location.search);
        const dq = qs.get('day');
        if (dq && allTrades.some(t => t.day === dq)) openRecap(dq);
      })
      .catch(err => {
        console.error('Failed to load trades:', err);
        kpiNetPnl.textContent = '—';
      });
  }

  monthPrevBtn.addEventListener('click', () => {
    if (!currentMonth) currentMonth = new Date();
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
    buildCalendar(allTrades);
  });

  monthNextBtn.addEventListener('click', () => {
    if (!currentMonth) currentMonth = new Date();
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
    buildCalendar(allTrades);
  });

  /* ===================== TRADE RECAP MODAL ===================== */
  const recapState = { open: false, day: null, idx: 0, chart: null, series: null, ro: null };

  function fmtTime(ts) {
    if (!ts) return '—';
    const t = ts.split(' ')[1] || ts;
    return t.slice(0, 5);
  }

  function openRecap(day) {
    const dayTrades = allTrades.filter(t => t.day === day)
      .sort((a, b) => (a.entry_ts || '').localeCompare(b.entry_ts || ''));
    if (!dayTrades.length) return;
    recapState.open = true; recapState.day = day; recapState.idx = 0;
    recapState.dayTrades = dayTrades;
    try { history.replaceState(null, '', `?day=${day}`); } catch (_) {}
    const modal = document.getElementById('recap-modal');
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    renderRecapTabs();
    renderRecap();
  }

  function closeRecap() {
    recapState.open = false;
    const modal = document.getElementById('recap-modal');
    if (modal) modal.classList.remove('open');
    document.body.style.overflow = '';
    if (recapState.ro) { recapState.ro.disconnect(); recapState.ro = null; }
    if (recapState.chart) { recapState.chart.remove(); recapState.chart = null; recapState.series = null; }
    try { history.replaceState(null, '', location.pathname); } catch (_) {}
  }

  function renderRecapTabs() {
    const tabs = document.getElementById('recap-tabs');
    const dt = recapState.dayTrades;
    tabs.innerHTML = '';
    const total = dt.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
    document.getElementById('recap-daytotal').textContent =
      `${recapState.day} · ${dt.length} trade${dt.length > 1 ? 's' : ''} · ${formatCurrency(total)}`;
    if (dt.length < 2) { tabs.style.display = 'none'; return; }
    tabs.style.display = 'flex';
    dt.forEach((t, i) => {
      const pill = document.createElement('button');
      pill.className = 'recap-pill' + (i === recapState.idx ? ' active' : '');
      pill.textContent = `Trade ${i + 1}`;
      pill.addEventListener('click', () => { recapState.idx = i; renderRecapTabs(); renderRecap(); });
      tabs.appendChild(pill);
    });
  }

  function statRow(label, value, cls) {
    return `<div class="recap-row"><span class="recap-k">${label}</span>` +
           `<span class="recap-v ${cls || ''}">${value}</span></div>`;
  }

  function renderRecap() {
    const t = recapState.dayTrades[recapState.idx];
    const pos = (Number(t.net_pnl ?? t.pnl) || 0) >= 0;
    const sideCls = t.direction === 'long' ? 'pos' : 'neg';
    const panel = document.getElementById('recap-stats');
    panel.innerHTML =
      `<div class="recap-pnl ${pos ? 'pos' : 'neg'}">
         <div class="recap-pnl-label">Net P&L</div>
         <div class="recap-pnl-val">${formatCurrency(t.net_pnl ?? t.pnl)}</div>
       </div>` +
      statRow('Side', `<b class="${sideCls}">${(t.direction || '').toUpperCase()}</b>`) +
      statRow('Symbol', t.symbol || 'MNQ') +
      statRow('Outcome', `<span class="recap-badge ${t.outcome === 'win' ? 'pos' : 'neg'}">${(t.outcome || '').toUpperCase()}</span>`) +
      statRow('R Multiple', `${t.r > 0 ? '+' : ''}${Number(t.r).toFixed(1)}R`, t.r >= 0 ? 'pos' : 'neg') +
      statRow('Contracts', t.contracts) +
      statRow('Points', t.points) +
      statRow('Ticks', t.ticks) +
      statRow('Ticks / Contract', t.ticks_per_contract) +
      statRow('Gross P&L', formatCurrency(t.gross_pnl ?? t.pnl)) +
      statRow('Commissions & Fees', formatCurrency(t.commissions || 0)) +
      statRow('Entry', `${fmtTime(t.entry_ts)} @ ${t.entry}`) +
      statRow('Exit', `${fmtTime(t.exit_ts)} @ ${t.exit_price}`);
    document.getElementById('recap-notes-body').textContent = t.setup || 'No notes.';
    renderRecapChart();
  }

  function themeColors() {
    const light = (document.documentElement.getAttribute('data-theme') === 'light');
    return {
      text: light ? '#334155' : '#c7ccd4',
      grid: light ? 'rgba(15,23,42,0.06)' : 'rgba(255,255,255,0.06)',
      up: '#2ec26a', down: '#e2444a',
    };
  }

  function renderRecapChart() {
    const t = recapState.dayTrades[recapState.idx];
    const host = document.getElementById('recap-chart');
    if (recapState.chart) { recapState.chart.remove(); recapState.chart = null; recapState.series = null; }
    host.innerHTML = '';
    if (!t.candles || !t.candles.length || typeof LightweightCharts === 'undefined') {
      host.innerHTML = '<div class="recap-nochart">No price data for this trade.</div>';
      return;
    }
    const c = themeColors();
    const chart = LightweightCharts.createChart(host, {
      width: host.clientWidth, height: host.clientHeight || 360,
      layout: { background: { type: 'solid', color: 'transparent' }, textColor: c.text, fontSize: 11 },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      rightPriceScale: { borderColor: c.grid },
      timeScale: { borderColor: c.grid, timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
    });
    const series = chart.addCandlestickSeries({
      upColor: c.up, downColor: c.down, borderUpColor: c.up, borderDownColor: c.down,
      wickUpColor: c.up, wickDownColor: c.down,
    });
    series.setData(t.candles.map(k => ({
      time: k.time, open: k.open, high: k.high, low: k.low, close: k.close,
    })));
    const long = t.direction === 'long';
    series.setMarkers([
      { time: t.entry_epoch, position: long ? 'belowBar' : 'aboveBar',
        color: long ? c.up : c.down, shape: long ? 'arrowUp' : 'arrowDown',
        text: `Entry ${t.entry}` },
      { time: t.exit_epoch, position: long ? 'aboveBar' : 'belowBar',
        color: t.outcome === 'win' ? c.up : c.down, shape: long ? 'arrowDown' : 'arrowUp',
        text: `Exit ${t.exit_price}` },
    ].sort((a, b) => a.time - b.time));
    chart.timeScale().fitContent();
    recapState.chart = chart; recapState.series = series;

    // ---- Position tool overlay (profit zone entry->target, risk zone entry->stop) ----
    const ovl = document.createElement('canvas');
    ovl.className = 'recap-ovl';
    host.appendChild(ovl);
    const ctx = ovl.getContext('2d');

    function snap(epoch) {
      let best = null, bd = Infinity;
      for (const k of t.candles) { const d = Math.abs(k.time - epoch); if (d < bd) { bd = d; best = k.time; } }
      return best;
    }
    const eSnap = snap(t.entry_epoch), xSnap = snap(t.exit_epoch);

    function drawPos() {
      const w = host.clientWidth, h = host.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      ovl.width = w * dpr; ovl.height = h * dpr;
      ovl.style.width = w + 'px'; ovl.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const ts = chart.timeScale();
      let x0 = ts.timeToCoordinate(eSnap), x1 = ts.timeToCoordinate(xSnap);
      const yE = series.priceToCoordinate(t.entry);
      const yT = t.target ? series.priceToCoordinate(t.target) : null;
      const yS = t.stop ? series.priceToCoordinate(t.stop) : null;
      if (x0 == null || x1 == null || yE == null) return;
      if (x1 < x0) { const tmp = x0; x0 = x1; x1 = tmp; }
      if (x1 - x0 < 26) x1 = x0 + 26; // keep a visible width for quick scalps
      const green = 'rgba(46,194,106,', red = 'rgba(226,68,74,';
      // profit zone
      if (yT != null) {
        ctx.fillStyle = green + '0.14)';
        ctx.fillRect(x0, Math.min(yE, yT), x1 - x0, Math.abs(yE - yT));
        ctx.strokeStyle = green + '0.9)'; ctx.lineWidth = 1;
        ctx.strokeRect(x0 + 0.5, Math.min(yE, yT) + 0.5, x1 - x0 - 1, Math.abs(yE - yT) - 1);
      }
      // risk zone
      if (yS != null) {
        ctx.fillStyle = red + '0.14)';
        ctx.fillRect(x0, Math.min(yE, yS), x1 - x0, Math.abs(yE - yS));
        ctx.strokeStyle = red + '0.9)'; ctx.lineWidth = 1;
        ctx.strokeRect(x0 + 0.5, Math.min(yE, yS) + 0.5, x1 - x0 - 1, Math.abs(yE - yS) - 1);
      }
      // entry line
      ctx.strokeStyle = c.text; ctx.lineWidth = 1.4; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(x0, yE); ctx.lineTo(x1, yE); ctx.stroke();
      // labels
      ctx.font = '11px system-ui, sans-serif'; ctx.textBaseline = 'middle';
      const lx = x1 + 6;
      const rr = (t.target && t.stop) ? Math.abs(t.target - t.entry) / Math.max(Math.abs(t.entry - t.stop), 1e-9) : null;
      function tag(x, y, text, color) {
        const pad = 4; const tw = ctx.measureText(text).width;
        ctx.fillStyle = color; ctx.fillRect(x, y - 8, tw + pad * 2, 16);
        ctx.fillStyle = '#fff'; ctx.fillText(text, x + pad, y + 1);
      }
      if (yT != null) tag(lx, yT, `Target ${t.target}`, green + '0.95)');
      tag(lx, yE, `Entry ${t.entry}`, 'rgba(120,125,135,0.95)');
      if (yS != null) tag(lx, yS, `Stop ${t.stop}`, red + '0.95)');
      if (rr) { ctx.fillStyle = c.text; ctx.fillText(`${rr.toFixed(1)}R`, x0 + 4, Math.min(yE, yT ?? yE) - 12); }
    }

    chart.timeScale().subscribeVisibleLogicalRangeChange(drawPos);
    requestAnimationFrame(drawPos);
    setTimeout(drawPos, 60);

    if (recapState.ro) recapState.ro.disconnect();
    recapState.ro = new ResizeObserver(() => {
      if (recapState.chart) { recapState.chart.applyOptions({ width: host.clientWidth, height: host.clientHeight }); drawPos(); }
    });
    recapState.ro.observe(host);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && recapState.open) closeRecap();
  });

  window.addEventListener('load', () => {
    initTheme();
    loadTrades();
    const modal = document.getElementById('recap-modal');
    modal.querySelector('.recap-scrim').addEventListener('click', closeRecap);
    modal.querySelector('#recap-close').addEventListener('click', closeRecap);
  });
})();
