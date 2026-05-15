const statusEl = document.getElementById('status');
const chartContainer = document.getElementById('ohlc-chart');
const macdContainer = document.getElementById('macd-chart');
const rsiContainer = document.getElementById('rsi-chart');
const summarySymbol = document.getElementById('summary-symbol');
const summaryClose = document.getElementById('summary-close');
const summaryChange = document.getElementById('summary-change');
const summaryRange = document.getElementById('summary-range');
const chartHeading = document.getElementById('chart-heading');
const sentimentTickerHeading = document.getElementById('sentiment-ticker-heading');
const sentimentTickerPrice = document.getElementById('sentiment-ticker-price');
const chartQuote = document.getElementById('chart-quote');
const chartLast = document.getElementById('chart-last');
const chartChange = document.getElementById('chart-change');
const chartChangePercent = document.getElementById('chart-change-percent');
const indicatorMenu = document.getElementById('indicator-menu');
const indicatorSummary = document.getElementById('indicator-summary');
const indicatorToggles = document.querySelectorAll('.indicator-toggle');
const chartFrame = document.getElementById('chart-frame');
const macdPane = document.getElementById('macd-pane');
const rsiPane = document.getElementById('rsi-pane');
const rsiLatestValue = document.getElementById('rsi-latest-value');
const optionsTitle = document.getElementById('options-title');
const optionsPrice = document.getElementById('options-price');
const optionsExpirySelect = document.getElementById('options-expiry-select');
const optionsStatus = document.getElementById('options-status');
const optionsChainBody = document.getElementById('options-chain-body');
const optionInsightTitle = document.getElementById('option-insight-title');
const optionAiRefresh = document.getElementById('option-ai-refresh');
const optionAiStatus = document.getElementById('option-ai-status');
const optionAiContent = document.getElementById('option-ai-content');
const aiTitle = document.getElementById('ai-title');
const aiRefresh = document.getElementById('ai-refresh');
const aiStatus = document.getElementById('ai-status');
const aiContent = document.getElementById('ai-content');
const newsTitle = document.getElementById('news-title');
const newsStatus = document.getElementById('news-status');
const newsItems = document.getElementById('news-items');
const marketSummaryStatus = document.getElementById('market-summary-status');
const marketSummaryItems = document.getElementById('market-summary-items');
const marketNewsStatus = document.getElementById('market-news-status');
const marketNewsItems = document.getElementById('market-news-items');
const workspace = document.querySelector('.workspace');
const watchlistToggle = document.getElementById('watchlist-toggle');
const watchlistForm = document.getElementById('watchlist-form');
const watchlistInput = document.getElementById('watchlist-input');
const watchlistItems = document.getElementById('watchlist-items');
const stockSuggestion = document.getElementById('stock-suggestion');
const signalGauge = document.getElementById('signal-gauge');
const gaugePointer = document.getElementById('gauge-pointer');
const gaugePercent = document.getElementById('gauge-percent');
const gaugeRating = document.getElementById('gauge-rating');
const analystRecommendation = document.getElementById('analyst-recommendation');
const analystTarget = document.getElementById('analyst-target');
const analystUpside = document.getElementById('analyst-upside');
const analystCount = document.getElementById('analyst-count');
const themeSelect = document.getElementById('theme-select');
const workspaceTabs = document.querySelectorAll('.workspace-tab');
const tabPanels = document.querySelectorAll('.tab-panel');
let chart;
let candleSeries;
let ema50Series;
let ema100Series;
let ema200Series;
let macdChart;
let macdLineSeries;
let macdSignalSeries;
let macdHistogramSeries;
let rsiChart;
let rsiSeries;
let rsiUpperSeries;
let rsiLowerSeries;
let chartResizeObserver;
let isSyncingTimeScale = false;
let shouldFitChartsOnNextResize = false;
let selectedIndicators = new Set(['ema50', 'ema100', 'ema200', 'macd', 'rsi']);
const DISPLAY_CALENDAR_DAYS = 365;
const WATCHLIST_PRICE_BATCH_SIZE = 5;
const OPTION_STRIKES_EACH_SIDE = 25;
const WATCHLIST_KEY = 'marketLensWatchlist';
const THEME_KEY = 'marketLensTheme';
const THEMES = new Set(['light', 'slate', 'mint', 'midnight', 'graphite', 'alpine', 'rose', 'contrast']);
const DEFAULT_THEME = 'graphite';
const WATCHLIST_RECOMMENDATION_LABELS = {
  'Strong Buy': 'S Buy',
  Buy: 'Buy',
  Neutral: 'Neutral',
  Sell: 'Sell',
  'Strong Sell': 'S Sell'
};
const INDICATOR_LABELS = {
  ema50: 'EMA 50',
  ema100: 'EMA 100',
  ema200: 'EMA 200',
  macd: 'MACD',
  rsi: 'RSI'
};
const DEFAULT_WATCHLIST = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'TSLA'];
let currentTicker = 'AAPL';
let watchlist = loadWatchlist();
let watchlistPrices = {};
let watchlistDirections = {};
let watchlistChanges = {};
let watchlistRecommendations = {};
let watchlistNames = {};
let watchlistSparklineData = {};
let watchlistThirtyDaySparklineData = {};
let lastAiTicker = '';
let lastOptionAiTicker = '';

function showStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

function getChartContainerSize(container, fallbackHeight) {
  const rect = container.getBoundingClientRect();
  const primaryWidth = document.querySelector('.primary-content')?.clientWidth || window.innerWidth || 900;

  return {
    width: Math.max(320, Math.round(rect.width || container.clientWidth || primaryWidth - 30)),
    height: Math.max(60, Math.round(rect.height || container.clientHeight || fallbackHeight))
  };
}

function fitChartsToContent() {
  if (!chart) return;

  chart.timeScale().fitContent();
  macdChart.timeScale().fitContent();
  rsiChart.timeScale().fitContent();
  shouldFitChartsOnNextResize = false;
}

function resizeCharts({ fitContent = false } = {}) {
  if (!chart) return;

  const mainSize = getChartContainerSize(chartContainer, 300);
  const macdSize = getChartContainerSize(macdContainer, 92);
  const rsiSize = getChartContainerSize(rsiContainer, 78);

  chart.applyOptions(mainSize);
  macdChart.applyOptions(macdSize);
  rsiChart.applyOptions(rsiSize);

  if (fitContent) {
    fitChartsToContent();
  }
}

function scheduleChartResize(options = {}) {
  requestAnimationFrame(() => {
    resizeCharts(options);
    requestAnimationFrame(() => resizeCharts(options));
  });
}

function getSelectedIndicators() {
  const checkedIndicators = [...indicatorToggles]
    .filter(toggle => toggle.checked)
    .map(toggle => toggle.value);

  return new Set(checkedIndicators);
}

function getPaneLayout(showMacd, showRsi) {
  if (showMacd && showRsi) return 'both';
  if (showMacd) return 'macd';
  if (showRsi) return 'rsi';
  return 'none';
}

function renderIndicatorSummary() {
  if (!indicatorSummary) return;

  indicatorSummary.textContent = '';

  if (!selectedIndicators.size) {
    indicatorSummary.textContent = 'Price only';
    return;
  }

  Object.entries(INDICATOR_LABELS).forEach(([value, label]) => {
    if (!selectedIndicators.has(value)) return;

    const item = document.createElement('span');
    item.className = 'indicator-summary-item';
    item.innerHTML = `<span class="legend-dot ${value}" aria-hidden="true"></span>${label}`;
    indicatorSummary.append(item);
  });
}

function applyIndicatorSelection(indicators = selectedIndicators) {
  selectedIndicators = indicators instanceof Set ? indicators : new Set(indicators);

  indicatorToggles.forEach(toggle => {
    toggle.checked = selectedIndicators.has(toggle.value);
  });

  const showEma50 = selectedIndicators.has('ema50');
  const showEma100 = selectedIndicators.has('ema100');
  const showEma200 = selectedIndicators.has('ema200');
  const showMacd = selectedIndicators.has('macd');
  const showRsi = selectedIndicators.has('rsi');

  if (chartFrame) chartFrame.dataset.panes = getPaneLayout(showMacd, showRsi);

  if (macdPane) macdPane.hidden = !showMacd;
  if (rsiPane) rsiPane.hidden = !showRsi;

  if (ema50Series) ema50Series.applyOptions({ visible: showEma50 });
  if (ema100Series) ema100Series.applyOptions({ visible: showEma100 });
  if (ema200Series) ema200Series.applyOptions({ visible: showEma200 });

  renderIndicatorSummary();
  scheduleChartResize();
}

function activateWorkspaceTab(tabName) {
  workspaceTabs.forEach(tab => {
    const isActive = tab.dataset.tab === tabName;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });

  tabPanels.forEach(panel => {
    const isActive = panel.id === `${tabName}-panel`;
    panel.classList.toggle('active', isActive);
    panel.hidden = !isActive;
  });

  if (tabName === 'chart') {
    scheduleChartResize({ fitContent: shouldFitChartsOnNextResize });
  }

  if (tabName === 'ai' && lastAiTicker !== currentTicker) {
    fetchAiInsight(currentTicker);
  }

  if (tabName === 'option-insight' && lastOptionAiTicker !== currentTicker) {
    fetchAiOptionInsight(currentTicker);
  }
}

function normalizeTicker(value) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, '');
}

function loadWatchlist() {
  try {
    const saved = JSON.parse(localStorage.getItem(WATCHLIST_KEY));
    if (Array.isArray(saved) && saved.length) {
      return saved.map(normalizeTicker).filter(Boolean);
    }
  } catch (error) {
    localStorage.removeItem(WATCHLIST_KEY);
  }
  return DEFAULT_WATCHLIST;
}

function saveWatchlist() {
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlist));
}

function getSavedTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return THEMES.has(saved) ? saved : DEFAULT_THEME;
  } catch (error) {
    return DEFAULT_THEME;
  }
}

function getCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function getChartThemeOptions() {
  return {
    layout: {
      background: { color: getCssVar('--chart-bg') || '#ffffff' },
      textColor: getCssVar('--chart-text') || '#475569',
      fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    },
    grid: {
      vertLines: { color: getCssVar('--chart-grid') || 'rgba(15, 23, 42, 0.08)' },
      horzLines: { color: getCssVar('--chart-grid') || 'rgba(15, 23, 42, 0.08)' }
    },
    rightPriceScale: {
      borderColor: getCssVar('--chart-border') || 'rgba(15, 23, 42, 0.12)'
    },
    timeScale: {
      borderColor: getCssVar('--chart-border') || 'rgba(15, 23, 42, 0.12)',
      timeVisible: true,
      secondsVisible: false
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal
    }
  };
}

function applyChartTheme() {
  if (!chart) return;

  const options = getChartThemeOptions();
  [chart, macdChart, rsiChart].filter(Boolean).forEach(chartInstance => {
    chartInstance.applyOptions(options);
  });

  const success = getCssVar('--success') || '#16a34a';
  const danger = getCssVar('--danger') || '#dc2626';
  candleSeries.applyOptions({
    upColor: success,
    downColor: danger,
    borderUpColor: success,
    borderDownColor: danger,
    wickUpColor: success,
    wickDownColor: danger
  });
  ema50Series.applyOptions({ color: getCssVar('--ema50') || '#38bdf8' });
  ema100Series.applyOptions({ color: getCssVar('--ema100') || '#f43f5e' });
  ema200Series.applyOptions({ color: getCssVar('--ema200') || '#8b5cf6' });
}

function applyTheme(theme) {
  const normalizedTheme = THEMES.has(theme) ? theme : DEFAULT_THEME;
  document.documentElement.dataset.theme = normalizedTheme;
  if (themeSelect) themeSelect.value = normalizedTheme;

  try {
    localStorage.setItem(THEME_KEY, normalizedTheme);
  } catch (error) {
    // A private browsing mode may block localStorage; the theme still applies for this session.
  }

  requestAnimationFrame(applyChartTheme);
}

function moveWatchlistSymbol(symbol, direction) {
  const currentIndex = watchlist.indexOf(symbol);
  const nextIndex = currentIndex + direction;
  if (currentIndex === -1 || nextIndex < 0 || nextIndex >= watchlist.length) return;

  [watchlist[currentIndex], watchlist[nextIndex]] = [watchlist[nextIndex], watchlist[currentIndex]];
  saveWatchlist();
  renderWatchlist();
}

function createSparklineSvg(values, direction) {
  const points = (values || []).filter(value => typeof value === 'number' && Number.isFinite(value));
  if (points.length < 2) {
    return '<span class="watchlist-sparkline-empty"></span>';
  }

  const width = 58;
  const height = 24;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const path = points.map((value, index) => {
    const x = (index / (points.length - 1)) * width;
    const y = height - (((value - min) / range) * (height - 4)) - 2;
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
  const className = direction === 'down' ? 'negative' : direction === 'up' ? 'positive' : 'neutral';

  return `
    <svg class="watchlist-sparkline ${className}" viewBox="0 0 ${width} ${height}" aria-hidden="true" focusable="false">
      <path d="${path}" />
    </svg>
  `;
}

async function fetchIntradaySparkline(symbol) {
  const params = new URLSearchParams({ ticker: symbol });
  const res = await fetch(`/api/intraday?${params.toString()}`);
  const payload = await res.json();
  if (!res.ok || !payload.data?.length) {
    throw new Error(payload.error || 'Failed to fetch intraday data.');
  }
  return payload.data.map(point => point.close);
}

function renderWatchlist() {
  watchlistItems.textContent = '';

  watchlist.forEach((symbol, index) => {
    const price = watchlistPrices[symbol];
    const direction = watchlistDirections[symbol];
    const change = watchlistChanges[symbol];
    const recommendation = watchlistRecommendations[symbol];
    const companyName = watchlistNames[symbol] || symbol;
    const intradaySparkline = createSparklineSvg(watchlistSparklineData[symbol], direction);
    const thirtyDaySparkline = createSparklineSvg(watchlistThirtyDaySparklineData[symbol], direction);
    const item = document.createElement('div');
    item.className = 'watchlist-item';
    item.classList.toggle('active', symbol === currentTicker);

    const reorderControls = document.createElement('div');
    reorderControls.className = 'watchlist-reorder';

    const upButton = document.createElement('button');
    upButton.type = 'button';
    upButton.setAttribute('aria-label', `Move ${symbol} up`);
    upButton.disabled = index === 0;
    upButton.textContent = '↑';
    upButton.addEventListener('click', () => {
      moveWatchlistSymbol(symbol, -1);
    });

    const downButton = document.createElement('button');
    downButton.type = 'button';
    downButton.setAttribute('aria-label', `Move ${symbol} down`);
    downButton.disabled = index === watchlist.length - 1;
    downButton.textContent = '↓';
    downButton.addEventListener('click', () => {
      moveWatchlistSymbol(symbol, 1);
    });

    reorderControls.append(upButton, downButton);

    const loadButton = document.createElement('button');
    loadButton.className = 'watchlist-symbol';
    loadButton.type = 'button';
    const changeValueText = change ? `${change.value >= 0 ? '+' : ''}${formatCurrency(change.value)}` : '--';
    const changePercentText = change ? `${change.percent >= 0 ? '+' : ''}${change.percent.toFixed(2)}%` : '--';
    const recommendationText = WATCHLIST_RECOMMENDATION_LABELS[recommendation?.label] || recommendation?.label || '--';
    const recommendationClass = recommendation?.recommendationClass || 'neutral';
    loadButton.innerHTML = `
      <span class="watchlist-identity">
        <span class="watchlist-ticker">${symbol}</span>
        <span class="watchlist-company">${companyName}</span>
      </span>
      <span class="watchlist-sparkline-wrap">${intradaySparkline}</span>
      <span class="watchlist-price">${price ? formatCurrency(price) : '--'}</span>
      <span class="watchlist-change">${changeValueText}</span>
      <span class="watchlist-change-percent">${changePercentText}</span>
      <span class="watchlist-recommendation ${recommendationClass}">${recommendationText}</span>
    `;
    loadButton.classList.toggle('positive', direction === 'up');
    loadButton.classList.toggle('negative', direction === 'down');
    loadButton.addEventListener('click', () => {
      fetchOhlc(symbol);
    });

    const removeButton = document.createElement('button');
    removeButton.className = 'watchlist-remove';
    removeButton.type = 'button';
    removeButton.setAttribute('aria-label', `Remove ${symbol} from watchlist`);
    removeButton.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M3 6h18" />
        <path d="M8 6V4h8v2" />
        <path d="M6 6l1 14h10l1-14" />
        <path d="M10 11v5" />
        <path d="M14 11v5" />
      </svg>
    `;
    removeButton.addEventListener('click', () => {
      watchlist = watchlist.filter(itemSymbol => itemSymbol !== symbol);
      delete watchlistRecommendations[symbol];
      saveWatchlist();
      renderWatchlist();
    });

    item.append(reorderControls, loadButton, removeButton);
    watchlistItems.append(item);
  });
}

async function refreshWatchlistPrices() {
  for (let i = 0; i < watchlist.length; i += WATCHLIST_PRICE_BATCH_SIZE) {
    const batch = watchlist.slice(i, i + WATCHLIST_PRICE_BATCH_SIZE);
    await Promise.all(batch.map(async symbol => {
      try {
        const params = new URLSearchParams({ ticker: symbol, range: '2y' });
        const res = await fetch(`/api/ohlc?${params.toString()}`);
        const payload = await res.json();
        if (!res.ok || !payload.data.length) return;
        const last = payload.data[payload.data.length - 1];
        const previous = payload.data[payload.data.length - 2];
        watchlistNames[symbol] = payload.name || symbol;
        watchlistThirtyDaySparklineData[symbol] = payload.data.slice(-30).map(point => point.close);
        try {
          watchlistSparklineData[symbol] = await fetchIntradaySparkline(symbol);
        } catch (sparklineError) {
          watchlistSparklineData[symbol] = null;
        }
        watchlistPrices[symbol] = last.close;
        if (previous) {
          const change = last.close - previous.close;
          watchlistDirections[symbol] = change >= 0 ? 'up' : 'down';
          watchlistChanges[symbol] = {
            value: change,
            percent: (change / previous.close) * 100
          };
        }
        watchlistRecommendations[symbol] = createTechnicalSignalFromData(payload.data);
      } catch (error) {
        watchlistPrices[symbol] = null;
        watchlistDirections[symbol] = null;
        watchlistChanges[symbol] = null;
        watchlistRecommendations[symbol] = null;
        watchlistNames[symbol] = symbol;
        watchlistSparklineData[symbol] = null;
        watchlistThirtyDaySparklineData[symbol] = null;
      }
    }));
    renderWatchlist();
  }
}

function addToWatchlist(symbol) {
  const normalized = normalizeTicker(symbol);
  if (!normalized) {
    showStatus('Please enter a ticker symbol.', true);
    return;
  }
  if (!watchlist.includes(normalized)) {
    watchlist = [normalized, ...watchlist];
    saveWatchlist();
  }
  renderWatchlist();
  fetchOhlc(normalized);
}

function calculateEMA(data, period) {
  if (data.length < period) return Array(data.length).fill(null);

  const ema = [];
  const multiplier = 2 / (period + 1);

  // Calculate SMA for the first period
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i];
    ema.push(null);
  }
  let currentEMA = sum / period;
  ema[period - 1] = currentEMA;

  // Calculate EMA for remaining values
  for (let i = period; i < data.length; i++) {
    currentEMA = (data[i] - currentEMA) * multiplier + currentEMA;
    ema.push(currentEMA);
  }

  return ema;
}

function calculateRSI(data, period = 14) {
  if (data.length <= period) return Array(data.length).fill(null);

  const rsi = Array(data.length).fill(null);
  let gainSum = 0;
  let lossSum = 0;

  for (let i = 1; i <= period; i++) {
    const change = data[i] - data[i - 1];
    if (change >= 0) gainSum += change;
    else lossSum += Math.abs(change);
  }

  let averageGain = gainSum / period;
  let averageLoss = lossSum / period;
  rsi[period] = averageLoss === 0 ? 100 : 100 - (100 / (1 + averageGain / averageLoss));

  for (let i = period + 1; i < data.length; i++) {
    const change = data[i] - data[i - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    averageGain = ((averageGain * (period - 1)) + gain) / period;
    averageLoss = ((averageLoss * (period - 1)) + loss) / period;
    rsi[i] = averageLoss === 0 ? 100 : 100 - (100 / (1 + averageGain / averageLoss));
  }

  return rsi;
}

function calculateMACD(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const fastEma = calculateEMA(data, fastPeriod);
  const slowEma = calculateEMA(data, slowPeriod);
  const macd = data.map((_, index) => {
    if (fastEma[index] == null || slowEma[index] == null) return null;
    return fastEma[index] - slowEma[index];
  });
  const signal = calculateEMA(macd.filter(value => value != null), signalPeriod);
  const paddedSignal = Array(macd.length).fill(null);
  let signalIndex = 0;

  macd.forEach((value, index) => {
    if (value == null) return;
    paddedSignal[index] = signal[signalIndex];
    signalIndex += 1;
  });

  const histogram = macd.map((value, index) => {
    if (value == null || paddedSignal[index] == null) return null;
    return value - paddedSignal[index];
  });

  return { macd, signal: paddedSignal, histogram };
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(value);
}

function formatDate(value) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(`${value}T00:00:00`));
}

function formatExpiration(timestamp) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(timestamp * 1000));
}

function formatNewsTime(timestamp) {
  if (!timestamp) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(timestamp * 1000));
}

function formatOptionValue(value, formatter = valueToFormat => valueToFormat) {
  if (typeof value !== 'number') return '--';
  return formatter(value);
}

function formatWholeNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

function formatImpliedVolatility(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  return `${(value * 100).toFixed(1)}%`;
}

function formatSignedPercent(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function setAnalystSummaryState({ recommendation = '--', target = '--', upside = '--', count = '--', upsideValue = null } = {}) {
  if (!analystRecommendation || !analystTarget || !analystUpside || !analystCount) return;

  analystRecommendation.textContent = recommendation;
  analystTarget.textContent = target;
  analystUpside.textContent = upside;
  analystCount.textContent = count;
  analystUpside.classList.toggle('positive', typeof upsideValue === 'number' && upsideValue >= 0);
  analystUpside.classList.toggle('negative', typeof upsideValue === 'number' && upsideValue < 0);
}

async function fetchAnalystSummary(ticker) {
  setAnalystSummaryState({ recommendation: 'Loading...', target: '--', upside: '--' });

  try {
    const res = await fetch(`/api/analyst?ticker=${encodeURIComponent(ticker)}`);
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.error || 'Failed to fetch analyst summary.');
    }

    setAnalystSummaryState({
      recommendation: payload.recommendation || '--',
      target: typeof payload.targetMeanPrice === 'number' ? formatCurrency(payload.targetMeanPrice) : '--',
      upside: formatSignedPercent(payload.upsidePercent),
      count: typeof payload.analystCount === 'number' ? String(payload.analystCount) : '--',
      upsideValue: payload.upsidePercent
    });
  } catch (error) {
    setAnalystSummaryState({ recommendation: 'Unavailable', target: '--', upside: '--' });
  }
}

function setNewsStatus(message, isError = false) {
  if (!newsStatus) return;
  newsStatus.textContent = message;
  newsStatus.classList.toggle('error', isError);
}

function setMarketNewsStatus(message, isError = false) {
  if (!marketNewsStatus) return;
  marketNewsStatus.textContent = message;
  marketNewsStatus.classList.toggle('error', isError);
}

function setMarketSummaryStatus(message, isError = false) {
  if (!marketSummaryStatus) return;
  marketSummaryStatus.textContent = message;
  marketSummaryStatus.classList.toggle('error', isError);
}

function setAiStatus(message, isError = false) {
  if (!aiStatus) return;
  aiStatus.textContent = message;
  aiStatus.classList.toggle('error', isError);
}

function formatMarketValue(value, symbol) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  if (symbol === 'BTC-USD') {
    return formatCurrency(value);
  }
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: value >= 1000 ? 0 : 2
  }).format(value);
}

function renderMarketSummary(quotes) {
  if (!marketSummaryItems) return;
  marketSummaryItems.textContent = '';

  if (!quotes.length) {
    marketSummaryItems.innerHTML = '<div class="news-empty">Market summary unavailable.</div>';
    return;
  }

  quotes.forEach(quote => {
    const change = typeof quote.change === 'number' ? quote.change : null;
    const changePercent = typeof quote.changePercent === 'number' ? quote.changePercent : null;
    const direction = change == null ? 'neutral' : change >= 0 ? 'positive' : 'negative';
    const card = document.createElement('article');
    card.className = `market-summary-card ${direction}`;
    card.innerHTML = `
      <span>${quote.symbol || quote.label || '--'}</span>
      <strong>${formatMarketValue(quote.price, quote.symbol)}</strong>
      <small>${change == null ? '--' : `${change >= 0 ? '+' : ''}${change.toFixed(2)}`} ${changePercent == null ? '' : `(${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)`}</small>
    `;
    marketSummaryItems.append(card);
  });
}

function createNewsCard(article) {
  const card = document.createElement('article');
  card.className = 'news-card';

  const meta = document.createElement('div');
  meta.className = 'news-meta';
  meta.textContent = [article.publisher, formatNewsTime(article.providerPublishTime)].filter(Boolean).join(' · ');

  const link = document.createElement('a');
  link.href = article.link;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = article.title;

  card.append(meta, link);
  return card;
}

function renderNews(ticker, articles) {
  if (!newsTitle || !newsItems) return;
  newsTitle.textContent = `${ticker} news`;
  newsItems.textContent = '';

  if (!articles.length) {
    newsItems.innerHTML = '<div class="news-empty">No recent news returned for this ticker.</div>';
    return;
  }

  articles.forEach(article => {
    newsItems.append(createNewsCard(article));
  });
}

function renderMarketNews(articles) {
  if (!marketNewsItems) return;
  marketNewsItems.textContent = '';

  if (!articles.length) {
    marketNewsItems.innerHTML = '<div class="news-empty">No market news returned.</div>';
    return;
  }

  articles.forEach(article => {
    marketNewsItems.append(createNewsCard(article));
  });
}

async function fetchNews(ticker) {
  if (!newsItems) return;
  setNewsStatus('Loading news...');
  try {
    const res = await fetch(`/api/news?ticker=${encodeURIComponent(ticker)}`);
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.error || 'Failed to fetch news.');
    }

    renderNews(payload.ticker, payload.news || []);
    setNewsStatus('');
  } catch (error) {
    if (newsTitle) newsTitle.textContent = `${ticker} news`;
    newsItems.innerHTML = '<div class="news-empty">News unavailable.</div>';
    setNewsStatus(error.message, true);
  }
}

async function fetchMarketNews() {
  if (!marketNewsItems) return;
  setMarketNewsStatus('Loading market news...');
  try {
    const res = await fetch('/api/market-news');
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.error || 'Failed to fetch market news.');
    }

    renderMarketNews(payload.news || []);
    setMarketNewsStatus('');
  } catch (error) {
    marketNewsItems.innerHTML = '<div class="news-empty">Market news unavailable.</div>';
    setMarketNewsStatus(error.message, true);
  }
}

async function fetchMarketSummary(ticker = currentTicker) {
  if (!marketSummaryItems) return;
  const normalizedTicker = normalizeTicker(ticker) || 'AAPL';
  setMarketSummaryStatus('Loading market summary...');
  try {
    const params = new URLSearchParams({ ticker: normalizedTicker });
    const res = await fetch(`/api/market-summary?${params.toString()}`);
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.error || 'Failed to fetch market summary.');
    }

    renderMarketSummary(payload.quotes || []);
    setMarketSummaryStatus('');
  } catch (error) {
    marketSummaryItems.innerHTML = '<div class="news-empty">Market summary unavailable.</div>';
    setMarketSummaryStatus(error.message, true);
  }
}

function renderAiInsight(payload) {
  if (!aiContent) return;
  const insight = payload.insight || {};
  const targetLevels = insight.targetLevels || {};
  const sections = [
    ['Setup', insight.setup],
    ['Bull Case', insight.bullCase],
    ['Bear Case', insight.bearCase],
    ['Watch Items', insight.watchItems],
    ['Risk Note', insight.riskNote]
  ];

  aiContent.textContent = '';

  const summaryCard = document.createElement('section');
  summaryCard.className = 'ai-card ai-summary-card';
  summaryCard.innerHTML = `
    <span>AI Take</span>
    <strong>${insight.summary || 'No summary returned.'}</strong>
  `;
  aiContent.append(summaryCard);

  const targetsCard = document.createElement('section');
  targetsCard.className = 'ai-card ai-targets-card';
  const targetsTitle = document.createElement('h3');
  targetsTitle.textContent = 'Target Levels';
  targetsCard.append(targetsTitle);

  const targetGrid = document.createElement('div');
  targetGrid.className = 'ai-target-grid';
  [
    ['Price Target', targetLevels.priceTarget],
    ['Buy Target', targetLevels.buyTarget],
    ['Sell Target', targetLevels.sellTarget]
  ].forEach(([label, level]) => {
    const item = document.createElement('div');
    item.className = 'ai-target-level';

    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    const priceEl = document.createElement('strong');
    priceEl.textContent = typeof level?.price === 'number' ? formatCurrency(level.price) : '--';
    const rationaleEl = document.createElement('p');
    rationaleEl.textContent = level?.rationale || '--';

    item.append(labelEl, priceEl, rationaleEl);
    targetGrid.append(item);
  });
  targetsCard.append(targetGrid);
  aiContent.append(targetsCard);

  sections.forEach(([title, value]) => {
    const card = document.createElement('section');
    card.className = 'ai-card';
    const list = Array.isArray(value) ? value : [value].filter(Boolean);
    card.innerHTML = `<h3>${title}</h3>`;

    if (list.length) {
      const ul = document.createElement('ul');
      list.forEach(item => {
        const li = document.createElement('li');
        li.textContent = item;
        ul.append(li);
      });
      card.append(ul);
    } else {
      const empty = document.createElement('p');
      empty.textContent = '--';
      card.append(empty);
    }

    aiContent.append(card);
  });

  const meta = document.createElement('p');
  meta.className = 'ai-disclaimer';
  meta.textContent = 'AI-generated research note. Verify with primary sources before making financial decisions.';
  aiContent.append(meta);
}

async function fetchAiInsight(ticker = currentTicker) {
  if (!aiContent) return;
  const normalizedTicker = normalizeTicker(ticker);
  if (!normalizedTicker) {
    setAiStatus('Please select a ticker first.', true);
    return;
  }

  if (aiTitle) aiTitle.textContent = `${normalizedTicker} insight`;
  if (aiRefresh) aiRefresh.disabled = true;
  aiContent.innerHTML = '<div class="ai-empty">Generating insight...</div>';
  setAiStatus('Asking OpenAI for a ticker insight...');

  try {
    const res = await fetch(`/api/ai-insight?ticker=${encodeURIComponent(normalizedTicker)}`);
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.error || 'Failed to generate AI insight.');
    }

    renderAiInsight(payload);
    lastAiTicker = normalizedTicker;
    setAiStatus(`Generated from recent price action and headlines for ${normalizedTicker}.`);
  } catch (error) {
    aiContent.innerHTML = '<div class="ai-empty">AI insight unavailable.</div>';
    setAiStatus(error.message, true);
  } finally {
    if (aiRefresh) aiRefresh.disabled = false;
  }
}

function setOptionAiStatus(message, isError = false) {
  if (!optionAiStatus) return;
  optionAiStatus.textContent = message;
  optionAiStatus.classList.toggle('error', isError);
}

function renderAiOptionInsight(payload) {
  if (!optionAiContent) return;
  const insight = payload.insight || {};
  const sections = [
    ['Activity Read', insight.activityRead],
    ['Volatility Read', insight.volatilityRead],
    ['Bullish Observation', insight.bullishObservation],
    ['Bearish Observation', insight.bearishObservation],
    ['Watch Items', insight.watchItems],
    ['Risk Note', insight.riskNote]
  ];

  optionAiContent.textContent = '';

  const summaryCard = document.createElement('section');
  summaryCard.className = 'option-ai-card option-ai-summary-card';
  summaryCard.innerHTML = `
    <span>AI Take</span>
    <strong>${insight.summary || 'No summary returned.'}</strong>
  `;
  optionAiContent.append(summaryCard);

  sections.forEach(([title, value]) => {
    const card = document.createElement('section');
    card.className = 'option-ai-card';
    const values = Array.isArray(value) ? value : [value].filter(Boolean);
    card.innerHTML = `<h4>${title}</h4>`;

    if (values.length) {
      const list = document.createElement('ul');
      values.forEach(item => {
        const li = document.createElement('li');
        li.textContent = item;
        list.append(li);
      });
      card.append(list);
    } else {
      const empty = document.createElement('p');
      empty.textContent = '--';
      card.append(empty);
    }

    optionAiContent.append(card);
  });
}

async function fetchAiOptionInsight(ticker = currentTicker) {
  if (!optionAiContent) return;
  const normalizedTicker = normalizeTicker(ticker);
  if (!normalizedTicker) {
    setOptionAiStatus('Please select a ticker first.', true);
    return;
  }

  if (optionAiRefresh) optionAiRefresh.disabled = true;
  optionAiContent.innerHTML = '<div class="option-ai-empty">Generating AI option insight...</div>';
  setOptionAiStatus('Asking OpenAI for an option read...');

  try {
    const res = await fetch(`/api/ai-option-insight?ticker=${encodeURIComponent(normalizedTicker)}`);
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.error || 'Failed to generate AI option insight.');
    }

    renderAiOptionInsight(payload);
    lastOptionAiTicker = normalizedTicker;
    setOptionAiStatus(`AI option read generated for ${normalizedTicker}.`);
  } catch (error) {
    optionAiContent.innerHTML = '<div class="option-ai-empty">AI option insight unavailable.</div>';
    setOptionAiStatus(error.message, true);
  } finally {
    if (optionAiRefresh) optionAiRefresh.disabled = false;
  }
}

function setOptionsStatus(message, isError = false) {
  optionsStatus.textContent = message;
  optionsStatus.classList.toggle('error', isError);
}

function renderOptionsChain(payload) {
  const callsByStrike = new Map(payload.calls.map(contract => [String(contract.strike), contract]));
  const putsByStrike = new Map(payload.puts.map(contract => [String(contract.strike), contract]));
  const strikes = [...new Set([...callsByStrike.keys(), ...putsByStrike.keys()])]
    .map(Number)
    .sort((a, b) => a - b);

  optionsTitle.textContent = payload.ticker;
  if (optionsPrice) {
    optionsPrice.textContent = typeof payload.underlyingPrice === 'number'
      ? formatCurrency(payload.underlyingPrice)
      : '--';
  }
  optionsChainBody.textContent = '';

  if (!strikes.length) {
    optionsChainBody.innerHTML = '<tr><td colspan="9">No contracts returned for this expiry.</td></tr>';
    return;
  }

  const nearestStrikeIndex = typeof payload.underlyingPrice === 'number'
    ? strikes.reduce((closestIndex, strike, index) => {
      const closestStrike = strikes[closestIndex];
      return Math.abs(strike - payload.underlyingPrice) < Math.abs(closestStrike - payload.underlyingPrice)
        ? index
        : closestIndex;
    }, 0)
    : 0;
  const nearestStrike = strikes[nearestStrikeIndex];
  const startIndex = Math.max(0, nearestStrikeIndex - OPTION_STRIKES_EACH_SIDE);
  const endIndex = Math.min(strikes.length, nearestStrikeIndex + OPTION_STRIKES_EACH_SIDE + 1);
  const visibleStrikes = strikes.slice(startIndex, endIndex);

  if (!visibleStrikes.length) {
    optionsChainBody.innerHTML = '<tr><td colspan="9">No strikes found within the selected range.</td></tr>';
    return;
  }

  visibleStrikes.forEach(strike => {
    const call = callsByStrike.get(String(strike));
    const put = putsByStrike.get(String(strike));
    const row = document.createElement('tr');
    row.classList.toggle('near-money', strike === nearestStrike);
    row.innerHTML = `
      <td>${formatOptionValue(call?.lastPrice, formatCurrency)}</td>
      <td>${formatOptionValue(call?.bid, formatCurrency)}</td>
      <td>${formatOptionValue(call?.ask, formatCurrency)}</td>
      <td>${formatOptionValue(call?.volume)}</td>
      <td class="strike-cell">${formatCurrency(strike)}</td>
      <td>${formatOptionValue(put?.lastPrice, formatCurrency)}</td>
      <td>${formatOptionValue(put?.bid, formatCurrency)}</td>
      <td>${formatOptionValue(put?.ask, formatCurrency)}</td>
      <td>${formatOptionValue(put?.volume)}</td>
    `;
    optionsChainBody.append(row);
  });
}

async function fetchOptionChain(ticker, expiration) {
  if (!optionsExpirySelect || !optionsChainBody) return;
  setOptionsStatus('Loading option chain...');
  try {
    const params = new URLSearchParams({ ticker });
    if (expiration) params.set('expiration', expiration);
    const res = await fetch(`/api/options?${params.toString()}`);
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.error || 'Failed to fetch option chain.');
    }

    const selected = String(payload.expiration);
    optionsExpirySelect.textContent = '';
    payload.expirations.forEach(expirationTimestamp => {
      const option = document.createElement('option');
      option.value = String(expirationTimestamp);
      option.textContent = formatExpiration(expirationTimestamp);
      option.selected = String(expirationTimestamp) === selected;
      optionsExpirySelect.append(option);
    });
    renderOptionsChain(payload);
    setOptionsStatus('');
  } catch (error) {
    optionsTitle.textContent = ticker;
    if (optionsPrice) optionsPrice.textContent = '--';
    optionsChainBody.innerHTML = '<tr><td colspan="9">Option chain unavailable.</td></tr>';
    setOptionsStatus(error.message, true);
  }
}

function updateSummary(formatted, ticker) {
  const last = formatted[formatted.length - 1];
  const previous = formatted[formatted.length - 2];
  chartHeading.textContent = ticker;
  if (sentimentTickerHeading) sentimentTickerHeading.textContent = ticker;
  if (sentimentTickerPrice) sentimentTickerPrice.textContent = formatCurrency(last.c);

  if (chartLast && chartChange && chartChangePercent) {
    chartLast.textContent = formatCurrency(last.c);
    chartQuote.classList.remove('positive', 'negative', 'neutral');

    if (previous) {
      const sessionChange = last.c - previous.c;
      const sessionChangePercent = (sessionChange / previous.c) * 100;
      chartChange.textContent = `${sessionChange >= 0 ? '+' : ''}${formatCurrency(sessionChange)}`;
      chartChangePercent.textContent = `${sessionChangePercent >= 0 ? '+' : ''}${sessionChangePercent.toFixed(2)}%`;
      chartQuote.classList.add(sessionChange >= 0 ? 'positive' : 'negative');
    } else {
      chartChange.textContent = '--';
      chartChangePercent.textContent = '--';
      chartQuote.classList.add('neutral');
    }
  }

  if (!summarySymbol || !summaryClose || !summaryChange || !summaryRange) {
    return;
  }

  const first = formatted[0];
  const change = last.c - first.c;
  const changePercent = (change / first.c) * 100;
  const changeText = `${change >= 0 ? '+' : ''}${formatCurrency(change)} (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)`;

  summarySymbol.textContent = ticker;
  summaryClose.textContent = formatCurrency(last.c);
  summaryChange.textContent = changeText;
  summaryChange.classList.toggle('positive', change >= 0);
  summaryChange.classList.toggle('negative', change < 0);
  summaryRange.textContent = `${formatDate(first.x)} - ${formatDate(last.x)}`;
}

function getLatestValue(values) {
  return values.findLast(value => value != null);
}

function updateRsiValue(rsiValues) {
  if (!rsiLatestValue) return;
  const latestRsi = getLatestValue(rsiValues);
  rsiLatestValue.textContent = typeof latestRsi === 'number' ? latestRsi.toFixed(1) : '--';
}

function getTechnicalRating(scoreRatio) {
  if (scoreRatio >= 0.65) return { label: 'Strong Buy', className: 'strong-buy' };
  if (scoreRatio >= 0.25) return { label: 'Buy', className: 'buy' };
  if (scoreRatio <= -0.65) return { label: 'Strong Sell', className: 'strong-sell' };
  if (scoreRatio <= -0.25) return { label: 'Sell', className: 'sell' };
  return { label: 'Neutral', className: 'neutral' };
}

function getRecommendationClass(className) {
  if (className === 'strong-buy' || className === 'buy') return 'positive';
  if (className === 'strong-sell' || className === 'sell') return 'negative';
  return 'neutral';
}

function analyzeTechnicalSignal(formatted, ema50, ema100, ema200, macd, macdSignal, macdHistogram, rsi) {
  const last = formatted[formatted.length - 1];
  const latestEma50 = getLatestValue(ema50);
  const latestEma100 = getLatestValue(ema100);
  const latestEma200 = getLatestValue(ema200);
  const latestMacd = getLatestValue(macd);
  const latestMacdSignal = getLatestValue(macdSignal);
  const latestMacdHistogram = getLatestValue(macdHistogram);
  const latestRsi = getLatestValue(rsi);
  const parts = [];
  let score = 0;
  let maxScore = 0;

  if (latestEma50 != null && latestEma100 != null && latestEma200 != null) {
    maxScore += 3;
    score += last.c > latestEma50 ? 1 : -1;
    score += latestEma50 > latestEma100 ? 1 : -1;
    score += latestEma100 > latestEma200 ? 1 : -1;

    if (last.c > latestEma50 && latestEma50 > latestEma100 && latestEma100 > latestEma200) {
      parts.push('EMA trend is bullish.');
    } else if (last.c < latestEma50 && latestEma50 < latestEma100 && latestEma100 < latestEma200) {
      parts.push('EMA trend is bearish.');
    } else {
      parts.push('EMA trend is mixed.');
    }
  } else {
    parts.push('EMA history is still building.');
  }

  if (latestMacd != null && latestMacdSignal != null && latestMacdHistogram != null) {
    maxScore += 1;
    if (latestMacd > latestMacdSignal && latestMacdHistogram > 0) {
      score += 1;
      parts.push('MACD is bullish.');
    } else if (latestMacd < latestMacdSignal && latestMacdHistogram < 0) {
      score -= 1;
      parts.push('MACD is bearish.');
    } else {
      parts.push('MACD is mixed.');
    }
  } else {
    parts.push('MACD is unavailable.');
  }

  if (latestRsi != null) {
    maxScore += 1;
    if (latestRsi >= 55 && latestRsi <= 70) {
      score += 1;
      parts.push(`RSI ${latestRsi.toFixed(1)} supports momentum.`);
    } else if (latestRsi <= 45 && latestRsi >= 30) {
      score -= 1;
      parts.push(`RSI ${latestRsi.toFixed(1)} is weak.`);
    } else if (latestRsi > 70) {
      parts.push(`RSI ${latestRsi.toFixed(1)} is overbought.`);
    } else if (latestRsi < 30) {
      parts.push(`RSI ${latestRsi.toFixed(1)} is oversold.`);
    } else {
      parts.push(`RSI ${latestRsi.toFixed(1)} is neutral.`);
    }
  } else {
    parts.push('RSI is unavailable.');
  }

  const scoreRatio = maxScore ? score / maxScore : 0;
  const percent = maxScore ? Math.round(((score + maxScore) / (maxScore * 2)) * 100) : 50;
  const rating = getTechnicalRating(scoreRatio);

  return {
    ...rating,
    percent: Math.max(0, Math.min(100, percent)),
    angle: ((Math.max(0, Math.min(100, percent)) / 100) * 180) - 90,
    message: `Technical recommendation: ${rating.label}. ${parts.join(' ')}`,
    recommendationClass: getRecommendationClass(rating.className)
  };
}

function updateSuggestion(technicalSignal) {
  stockSuggestion.classList.remove('positive', 'negative', 'neutral');
  stockSuggestion.textContent = technicalSignal.message;
  stockSuggestion.classList.add(technicalSignal.recommendationClass);
}

function updateGauge(technicalSignal) {
  signalGauge.className = `signal-gauge ${technicalSignal.className}`;
  signalGauge.setAttribute('aria-label', `Technical rating: ${technicalSignal.label}, ${technicalSignal.percent}%`);
  gaugePointer.style.transform = `translateX(-50%) rotate(${technicalSignal.angle}deg)`;
  gaugePercent.textContent = `${technicalSignal.percent}%`;
  gaugeRating.textContent = technicalSignal.label;
}

function syncTimeScaleRange(sourceChart, range) {
  if (isSyncingTimeScale || !range) return;

  isSyncingTimeScale = true;
  [chart, macdChart, rsiChart].filter(chartInstance => chartInstance && chartInstance !== sourceChart).forEach(chartInstance => {
    chartInstance.timeScale().setVisibleLogicalRange(range);
  });
  isSyncingTimeScale = false;
}

function syncChartTimeScales() {
  [chart, macdChart, rsiChart].filter(Boolean).forEach(chartInstance => {
    chartInstance.timeScale().subscribeVisibleLogicalRangeChange(range => {
      syncTimeScaleRange(chartInstance, range);
    });
  });
}

function ensureChart() {
  if (chart) return;

  const baseOptions = getChartThemeOptions();
  const success = getCssVar('--success') || '#16a34a';
  const danger = getCssVar('--danger') || '#dc2626';
  const mainSize = getChartContainerSize(chartContainer, 300);
  const macdSize = getChartContainerSize(macdContainer, 92);
  const rsiSize = getChartContainerSize(rsiContainer, 78);

  chart = LightweightCharts.createChart(chartContainer, {
    ...baseOptions,
    ...mainSize
  });

  candleSeries = chart.addCandlestickSeries({
    upColor: success,
    downColor: danger,
    borderUpColor: success,
    borderDownColor: danger,
    wickUpColor: success,
    wickDownColor: danger,
    priceFormat: {
      type: 'price',
      precision: 2,
      minMove: 0.01
    }
  });

  ema50Series = chart.addLineSeries({
    color: getCssVar('--ema50') || '#38bdf8',
    lineWidth: 2,
    priceLineVisible: false,
    lastValueVisible: false
  });

  ema100Series = chart.addLineSeries({
    color: getCssVar('--ema100') || '#f43f5e',
    lineWidth: 2,
    priceLineVisible: false,
    lastValueVisible: false
  });

  ema200Series = chart.addLineSeries({
    color: getCssVar('--ema200') || '#8b5cf6',
    lineWidth: 2,
    priceLineVisible: false,
    lastValueVisible: false
  });

  macdChart = LightweightCharts.createChart(macdContainer, {
    ...baseOptions,
    ...macdSize
  });
  macdHistogramSeries = macdChart.addHistogramSeries({
    priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    priceLineVisible: false,
    lastValueVisible: false
  });
  macdLineSeries = macdChart.addLineSeries({
    color: '#2563eb',
    lineWidth: 2,
    priceLineVisible: false,
    lastValueVisible: false
  });
  macdSignalSeries = macdChart.addLineSeries({
    color: '#f97316',
    lineWidth: 2,
    priceLineVisible: false,
    lastValueVisible: false
  });

  rsiChart = LightweightCharts.createChart(rsiContainer, {
    ...baseOptions,
    ...rsiSize
  });
  rsiSeries = rsiChart.addLineSeries({
    color: '#7c3aed',
    lineWidth: 2,
    priceLineVisible: false,
    lastValueVisible: false
  });
  rsiUpperSeries = rsiChart.addLineSeries({
    color: 'rgba(220, 38, 38, 0.55)',
    lineWidth: 1,
    priceLineVisible: false,
    lastValueVisible: false
  });
  rsiLowerSeries = rsiChart.addLineSeries({
    color: 'rgba(22, 163, 74, 0.55)',
    lineWidth: 1,
    priceLineVisible: false,
    lastValueVisible: false
  });

  chartResizeObserver = new ResizeObserver(entries => {
    entries.forEach(entry => {
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;
      if (entry.target === chartContainer) chart.applyOptions({ width, height });
      if (entry.target === macdContainer) macdChart.applyOptions({ width, height });
      if (entry.target === rsiContainer) rsiChart.applyOptions({ width, height });
    });
  });
  chartResizeObserver.observe(chartContainer);
  chartResizeObserver.observe(macdContainer);
  chartResizeObserver.observe(rsiContainer);
  syncChartTimeScales();
  applyIndicatorSelection(selectedIndicators);
}

function toLineData(formatted, values) {
  return formatted
    .map((point, index) => ({
      time: point.x,
      value: values[index]
    }))
    .filter(point => point.value != null);
}

function getOneYearStartIndex(points) {
  if (!points.length) return 0;

  const lastDate = new Date(`${points[points.length - 1].x}T00:00:00`);
  const cutoffDate = new Date(lastDate);
  cutoffDate.setDate(cutoffDate.getDate() - DISPLAY_CALENDAR_DAYS);
  const index = points.findIndex(point => new Date(`${point.x}T00:00:00`) >= cutoffDate);
  return index === -1 ? 0 : index;
}

function formatOhlcData(data) {
  return data.map(point => ({
    x: point.date,
    o: point.open,
    h: point.high,
    l: point.low,
    c: point.close
  }));
}

function createTechnicalSignalFromData(data) {
  const formattedAll = formatOhlcData(data);
  const closePrices = formattedAll.map(p => p.c);
  const ema50All = calculateEMA(closePrices, 50);
  const ema100All = calculateEMA(closePrices, 100);
  const ema200All = calculateEMA(closePrices, 200);
  const macdAll = calculateMACD(closePrices);
  const rsiAll = calculateRSI(closePrices);
  const startIndex = getOneYearStartIndex(formattedAll);

  return analyzeTechnicalSignal(
    formattedAll.slice(startIndex),
    ema50All.slice(startIndex),
    ema100All.slice(startIndex),
    ema200All.slice(startIndex),
    macdAll.macd.slice(startIndex),
    macdAll.signal.slice(startIndex),
    macdAll.histogram.slice(startIndex),
    rsiAll.slice(startIndex)
  );
}

function createChart(data, ticker) {
  const formattedAll = formatOhlcData(data);

  // Calculate EMAs with enough historical data, then display the latest window.
  const closePrices = formattedAll.map(p => p.c);
  const ema50All = calculateEMA(closePrices, 50);
  const ema100All = calculateEMA(closePrices, 100);
  const ema200All = calculateEMA(closePrices, 200);
  const macdAll = calculateMACD(closePrices);
  const rsiAll = calculateRSI(closePrices);
  const startIndex = getOneYearStartIndex(formattedAll);
  const formatted = formattedAll.slice(startIndex);
  const ema50 = ema50All.slice(startIndex);
  const ema100 = ema100All.slice(startIndex);
  const ema200 = ema200All.slice(startIndex);
  const macd = macdAll.macd.slice(startIndex);
  const macdSignal = macdAll.signal.slice(startIndex);
  const macdHistogram = macdAll.histogram.slice(startIndex);
  const rsi = rsiAll.slice(startIndex);
  const technicalSignal = analyzeTechnicalSignal(formatted, ema50, ema100, ema200, macd, macdSignal, macdHistogram, rsi);
  watchlistRecommendations[ticker] = technicalSignal;
  updateSummary(formatted, ticker);
  updateSuggestion(technicalSignal);
  updateGauge(technicalSignal);
  updateRsiValue(rsi);

  ensureChart();
  candleSeries.setData(formatted.map(point => ({
    time: point.x,
    open: point.o,
    high: point.h,
    low: point.l,
    close: point.c
  })));
  ema50Series.setData(toLineData(formatted, ema50));
  ema100Series.setData(toLineData(formatted, ema100));
  ema200Series.setData(toLineData(formatted, ema200));
  applyIndicatorSelection(selectedIndicators);
  macdLineSeries.setData(toLineData(formatted, macd));
  macdSignalSeries.setData(toLineData(formatted, macdSignal));
  macdHistogramSeries.setData(toLineData(formatted, macdHistogram).map(point => ({
    ...point,
    color: point.value >= 0 ? 'rgba(22, 163, 74, 0.48)' : 'rgba(220, 38, 38, 0.48)'
  })));
  rsiSeries.setData(toLineData(formatted, rsi));
  rsiUpperSeries.setData(formatted.map(point => ({ time: point.x, value: 70 })));
  rsiLowerSeries.setData(formatted.map(point => ({ time: point.x, value: 30 })));
  shouldFitChartsOnNextResize = true;
  scheduleChartResize({ fitContent: !document.getElementById('chart-panel')?.hidden });

  return formatted.length;
}

async function fetchOhlc(ticker) {
  const normalizedTicker = normalizeTicker(ticker);
  if (!normalizedTicker) {
    showStatus('Please enter a ticker symbol.', true);
    return;
  }
  showStatus('Loading data...', false);
  try {
    const params = new URLSearchParams({ ticker: normalizedTicker, range: '2y' });
    const res = await fetch(`/api/ohlc?${params.toString()}`);
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.error || 'Failed to fetch OHLC data.');
    }
    if (!payload.data.length) {
      throw new Error('No OHLC data returned for this ticker.');
    }
    const visibleDays = createChart(payload.data, payload.ticker);
    watchlistNames[payload.ticker] = payload.name || payload.ticker;
    watchlistThirtyDaySparklineData[payload.ticker] = payload.data.slice(-30).map(point => point.close);
    try {
      watchlistSparklineData[payload.ticker] = await fetchIntradaySparkline(payload.ticker);
    } catch (sparklineError) {
      watchlistSparklineData[payload.ticker] = null;
    }
    currentTicker = payload.ticker;
    fetchMarketSummary(currentTicker);
    fetchOptionChain(payload.ticker);
    fetchNews(payload.ticker);
    fetchAnalystSummary(payload.ticker);
    if (aiTitle) aiTitle.textContent = `${payload.ticker} insight`;
    if (optionInsightTitle) optionInsightTitle.textContent = `${payload.ticker} option insight`;
    if (!document.getElementById('ai-panel')?.hidden) {
      fetchAiInsight(payload.ticker);
    }
    if (!document.getElementById('option-insight-panel')?.hidden) {
      fetchAiOptionInsight(payload.ticker);
    }
    watchlistPrices[payload.ticker] = payload.data[payload.data.length - 1].close;
    if (payload.data.length > 1) {
      const last = payload.data[payload.data.length - 1];
      const previous = payload.data[payload.data.length - 2];
      const change = last.close - previous.close;
      watchlistDirections[payload.ticker] = change >= 0 ? 'up' : 'down';
      watchlistChanges[payload.ticker] = {
        value: change,
        percent: (change / previous.close) * 100
      };
    }

    renderWatchlist();
    showStatus('', false);
  } catch (error) {
    showStatus(error.message, true);
  }
}

watchlistForm.addEventListener('submit', event => {
  event.preventDefault();
  addToWatchlist(watchlistInput.value);
  watchlistInput.value = '';
});

if (watchlistToggle) {
  watchlistToggle.addEventListener('click', () => {
    const isCollapsed = workspace.classList.toggle('watchlist-collapsed');
    watchlistToggle.setAttribute('aria-expanded', String(!isCollapsed));
    watchlistToggle.setAttribute('aria-label', isCollapsed ? 'Expand watchlist' : 'Collapse watchlist');
  });
}

workspaceTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    activateWorkspaceTab(tab.dataset.tab);
  });
});

indicatorToggles.forEach(toggle => {
  toggle.addEventListener('change', () => {
    applyIndicatorSelection(getSelectedIndicators());
  });
});

document.addEventListener('click', event => {
  if (indicatorMenu && indicatorMenu.open && !indicatorMenu.contains(event.target)) {
    indicatorMenu.open = false;
  }
});

optionsExpirySelect.addEventListener('change', () => {
  fetchOptionChain(currentTicker, optionsExpirySelect.value);
});

if (themeSelect) {
  themeSelect.addEventListener('change', () => {
    applyTheme(themeSelect.value);
  });
}

if (aiRefresh) {
  aiRefresh.addEventListener('click', () => {
    fetchAiInsight(currentTicker);
  });
}

if (optionAiRefresh) {
  optionAiRefresh.addEventListener('click', () => {
    fetchAiOptionInsight(currentTicker);
  });
}

window.addEventListener('DOMContentLoaded', () => {
  applyIndicatorSelection(selectedIndicators);
  applyTheme(getSavedTheme());
  renderWatchlist();
  refreshWatchlistPrices();
  fetchMarketSummary(currentTicker);
  fetchMarketNews();
  fetchOhlc('AAPL');
});
