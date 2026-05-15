const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
let yahooSession = null;

function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) return;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && process.env[key] == null) {
      process.env[key] = value;
    }
  });
}

loadEnvFile();

app.use(express.static(path.join(__dirname, 'public')));

function getSetCookieHeaders(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const cookie = headers.get('set-cookie');
  return cookie ? [cookie] : [];
}

async function getYahooSession() {
  if (yahooSession && yahooSession.expiresAt > Date.now()) return yahooSession;

  const cookieResponse = await fetch('https://fc.yahoo.com', {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    redirect: 'manual'
  });
  const cookie = getSetCookieHeaders(cookieResponse.headers)
    .map(value => value.split(';')[0])
    .join('; ');

  if (!cookie) {
    throw new Error('Could not establish Yahoo Finance session.');
  }

  const crumbResponse = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: {
      'Accept': 'text/plain',
      'Cookie': cookie,
      'User-Agent': 'Mozilla/5.0'
    }
  });

  if (!crumbResponse.ok) {
    throw new Error(`Yahoo Finance crumb request failed with status ${crumbResponse.status}`);
  }

  const crumb = (await crumbResponse.text()).trim();
  yahooSession = {
    cookie,
    crumb,
    expiresAt: Date.now() + (30 * 60 * 1000)
  };
  return yahooSession;
}

app.get('/api/ohlc', async (req, res) => {
  const ticker = (req.query.ticker || '').trim().toUpperCase();
  const range = req.query.range === '2y' ? '2y' : '1y';
  if (!ticker) {
    return res.status(400).json({ error: 'Ticker symbol is required.' });
  }

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=1d`;
  try {
    const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!response.ok) {
      return res.status(response.status).json({ error: `Yahoo Finance request failed with status ${response.status}` });
    }
    const payload = await response.json();
    const result = payload.chart?.result?.[0];
    const error = payload.chart?.error;

    if (error || !result) {
      return res.status(404).json({ error: `Could not fetch data for ticker ${ticker}.` });
    }

    const meta = result.meta || {};
    const timestamps = result.timestamp || [];
    const quote = result.indicators?.quote?.[0];
    if (!quote || !quote.open || !quote.high || !quote.low || !quote.close) {
      return res.status(500).json({ error: 'Incomplete data returned by Yahoo Finance.' });
    }

    const data = timestamps.map((timestamp, index) => ({
      date: new Date(timestamp * 1000).toISOString().slice(0, 10),
      open: quote.open[index],
      high: quote.high[index],
      low: quote.low[index],
      close: quote.close[index]
    })).filter(point => point.open != null && point.high != null && point.low != null && point.close != null);

    return res.json({
      ticker,
      name: meta.shortName || meta.longName || meta.instrumentInfo?.shortName || ticker,
      data
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unknown error while fetching data.' });
  }
});

app.get('/api/intraday', async (req, res) => {
  const ticker = (req.query.ticker || '').trim().toUpperCase();
  if (!ticker) {
    return res.status(400).json({ error: 'Ticker symbol is required.' });
  }

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=5m`;
  try {
    const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!response.ok) {
      return res.status(response.status).json({ error: `Yahoo Finance intraday request failed with status ${response.status}` });
    }

    const payload = await response.json();
    const result = payload.chart?.result?.[0];
    const error = payload.chart?.error;
    const timestamps = result?.timestamp || [];
    const quote = result?.indicators?.quote?.[0];

    if (error || !result || !quote?.close) {
      return res.status(404).json({ error: `Could not fetch intraday data for ticker ${ticker}.` });
    }

    const data = timestamps.map((timestamp, index) => ({
      time: new Date(timestamp * 1000).toISOString(),
      close: quote.close[index]
    })).filter(point => typeof point.close === 'number');

    return res.json({ ticker, data });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unknown error while fetching intraday data.' });
  }
});

function yahooRawValue(value) {
  if (value && typeof value === 'object' && 'raw' in value) return value.raw;
  return value;
}

function titleCaseRecommendation(value) {
  if (!value || typeof value !== 'string') return null;
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function recommendationFromMean(mean) {
  if (typeof mean !== 'number') return null;
  if (mean <= 1.8) return 'Strong Buy';
  if (mean <= 2.6) return 'Buy';
  if (mean <= 3.4) return 'Hold';
  if (mean <= 4.2) return 'Underperform';
  return 'Sell';
}

app.get('/api/analyst', async (req, res) => {
  const ticker = (req.query.ticker || '').trim().toUpperCase();
  if (!ticker) {
    return res.status(400).json({ error: 'Ticker symbol is required.' });
  }

  try {
    let session = await getYahooSession();
    const fetchAnalystData = activeSession => {
      const params = new URLSearchParams({
        modules: 'financialData,price',
        crumb: activeSession.crumb
      });
      const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?${params.toString()}`;
      return fetch(url, {
        headers: {
          'Accept': 'application/json',
          'Cookie': activeSession.cookie,
          'User-Agent': 'Mozilla/5.0'
        }
      });
    };

    let response = await fetchAnalystData(session);
    if (!response.ok && response.status === 401) {
      yahooSession = null;
      session = await getYahooSession();
      response = await fetchAnalystData(session);
    }

    if (!response.ok) {
      return res.status(response.status).json({ error: `Yahoo Finance analyst request failed with status ${response.status}` });
    }

    const payload = await response.json();
    const result = payload.quoteSummary?.result?.[0];
    const error = payload.quoteSummary?.error;
    if (error || !result) {
      return res.status(404).json({ error: `Could not fetch analyst data for ticker ${ticker}.` });
    }

    const financialData = result.financialData || {};
    const price = result.price || {};
    const targetMeanPrice = yahooRawValue(financialData.targetMeanPrice);
    const currentPrice = yahooRawValue(financialData.currentPrice) ?? yahooRawValue(price.regularMarketPrice);
    const recommendationMean = yahooRawValue(financialData.recommendationMean);
    const recommendation = titleCaseRecommendation(financialData.recommendationKey)
      || recommendationFromMean(recommendationMean);
    const upsidePercent = typeof targetMeanPrice === 'number' && typeof currentPrice === 'number' && currentPrice > 0
      ? ((targetMeanPrice - currentPrice) / currentPrice) * 100
      : null;

    return res.json({
      ticker,
      recommendation,
      recommendationMean,
      analystCount: yahooRawValue(financialData.numberOfAnalystOpinions),
      currentPrice,
      targetMeanPrice,
      targetMedianPrice: yahooRawValue(financialData.targetMedianPrice),
      targetHighPrice: yahooRawValue(financialData.targetHighPrice),
      targetLowPrice: yahooRawValue(financialData.targetLowPrice),
      upsidePercent
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unknown error while fetching analyst data.' });
  }
});

app.get('/api/options', async (req, res) => {
  const ticker = (req.query.ticker || '').trim().toUpperCase();
  const requestedExpiration = req.query.expiration ? Number(req.query.expiration) : null;
  if (!ticker) {
    return res.status(400).json({ error: 'Ticker symbol is required.' });
  }

  try {
    const session = await getYahooSession();
    const fetchOptions = async expiration => {
      const params = new URLSearchParams({ crumb: session.crumb });
      if (expiration) params.set('date', String(expiration));
      const url = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(ticker)}?${params.toString()}`;
      return fetch(url, {
        headers: {
          'Accept': 'application/json',
          'Cookie': session.cookie,
          'User-Agent': 'Mozilla/5.0'
        }
      });
    };

    let response = await fetchOptions(requestedExpiration);
    if (!response.ok && response.status === 401) {
      yahooSession = null;
      const freshSession = await getYahooSession();
      session.cookie = freshSession.cookie;
      session.crumb = freshSession.crumb;
      response = await fetchOptions(requestedExpiration);
    }

    if (!response.ok) {
      return res.status(response.status).json({ error: `Yahoo Finance options request failed with status ${response.status}` });
    }

    let payload = await response.json();
    let result = payload.optionChain?.result?.[0];
    const error = payload.optionChain?.error;
    const expirations = result?.expirationDates || [];
    const selectedExpiration = requestedExpiration || expirations[0];

    if (!requestedExpiration && selectedExpiration && result?.options?.[0]?.expirationDate !== selectedExpiration) {
      response = await fetchOptions(selectedExpiration);
      if (!response.ok) {
        return res.status(response.status).json({ error: `Yahoo Finance options request failed with status ${response.status}` });
      }
      payload = await response.json();
      result = payload.optionChain?.result?.[0];
    }

    const chain = result?.options?.[0];
    const quote = result?.quote || {};

    if (error || !result || !chain) {
      return res.status(404).json({ error: `Could not fetch option chain for ticker ${ticker}.` });
    }

    const normalizeContract = contract => ({
      contractSymbol: contract.contractSymbol,
      strike: contract.strike,
      lastPrice: contract.lastPrice,
      bid: contract.bid,
      ask: contract.ask,
      change: contract.change,
      percentChange: contract.percentChange,
      volume: contract.volume,
      openInterest: contract.openInterest,
      impliedVolatility: contract.impliedVolatility,
      inTheMoney: contract.inTheMoney
    });

    return res.json({
      ticker,
      underlyingPrice: quote.regularMarketPrice,
      expiration: chain.expirationDate,
      expirations,
      calls: (chain.calls || []).map(normalizeContract),
      puts: (chain.puts || []).map(normalizeContract)
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unknown error while fetching option chain.' });
  }
});

app.get('/api/options-summary', async (req, res) => {
  const ticker = (req.query.ticker || '').trim().toUpperCase();
  if (!ticker) {
    return res.status(400).json({ error: 'Ticker symbol is required.' });
  }

  try {
    const session = await getYahooSession();
    const url = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(ticker)}?crumb=${encodeURIComponent(session.crumb)}`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Cookie': session.cookie,
        'User-Agent': 'Mozilla/5.0'
      }
    });
    if (!response.ok) {
      return res.status(response.status).json({ error: `Yahoo Finance options request failed with status ${response.status}` });
    }

    const payload = await response.json();
    const result = payload.optionChain?.result?.[0];
    const error = payload.optionChain?.error;
    const chain = result?.options?.[0];
    const quote = result?.quote || {};

    if (error || !result || !chain) {
      return res.status(404).json({ error: `Could not fetch option chain for ticker ${ticker}.` });
    }

    const calls = chain.calls || [];
    const puts = chain.puts || [];
    const underlyingPrice = quote.regularMarketPrice;
    if (!calls.length && !puts.length) {
      return res.status(404).json({ error: `No options returned for ticker ${ticker}.` });
    }

    const strikes = [...calls, ...puts]
      .map(contract => contract.strike)
      .filter(strike => typeof strike === 'number');
    const atmStrike = strikes.reduce((closest, strike) => {
      if (closest == null) return strike;
      return Math.abs(strike - underlyingPrice) < Math.abs(closest - underlyingPrice) ? strike : closest;
    }, null);

    const findContract = contracts => contracts
      .filter(contract => contract.strike === atmStrike)
      .sort((a, b) => (b.openInterest || 0) - (a.openInterest || 0))[0] || null;

    const expiration = chain.expirationDate
      ? new Date(chain.expirationDate * 1000).toISOString().slice(0, 10)
      : null;

    return res.json({
      ticker,
      underlyingPrice,
      expiration,
      strike: atmStrike,
      call: findContract(calls),
      put: findContract(puts)
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unknown error while fetching option chain.' });
  }
});

app.get('/api/news', async (req, res) => {
  const ticker = (req.query.ticker || '').trim().toUpperCase();
  if (!ticker) {
    return res.status(400).json({ error: 'Ticker symbol is required.' });
  }

  const params = new URLSearchParams({
    q: ticker,
    quotesCount: '0',
    newsCount: '8'
  });
  const url = `https://query1.finance.yahoo.com/v1/finance/search?${params.toString()}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Yahoo Finance news request failed with status ${response.status}` });
    }

    const payload = await response.json();
    const news = (payload.news || []).map(item => ({
      title: item.title,
      publisher: item.publisher,
      link: item.link,
      providerPublishTime: item.providerPublishTime,
      thumbnail: item.thumbnail?.resolutions?.[0]?.url || null
    })).filter(item => item.title && item.link);

    return res.json({ ticker, news });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unknown error while fetching news.' });
  }
});

app.get('/api/market-news', async (req, res) => {
  const params = new URLSearchParams({
    q: 'stock market',
    quotesCount: '0',
    newsCount: '20'
  });
  const url = `https://query1.finance.yahoo.com/v1/finance/search?${params.toString()}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Yahoo Finance market news request failed with status ${response.status}` });
    }

    const payload = await response.json();
    const news = (payload.news || []).map(item => ({
      title: item.title,
      publisher: item.publisher,
      link: item.link,
      providerPublishTime: item.providerPublishTime,
      thumbnail: item.thumbnail?.resolutions?.[0]?.url || null
    })).filter(item => item.title && item.link);

    return res.json({ topic: 'Market News', news });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unknown error while fetching market news.' });
  }
});

app.get('/api/market-summary', async (req, res) => {
  const symbols = ['^GSPC', '^IXIC', '^DJI', 'AAPL', '^VIX', 'BTC-USD'];
  const labels = {
    '^GSPC': 'S&P 500',
    '^IXIC': 'Nasdaq',
    '^DJI': 'Dow',
    AAPL: 'Apple',
    '^VIX': 'VIX',
    'BTC-USD': 'Bitcoin'
  };

  try {
    const quotes = (await Promise.all(symbols.map(async symbol => {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
      const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!response.ok) return null;

      const payload = await response.json();
      const result = payload.chart?.result?.[0];
      const closes = (result?.indicators?.quote?.[0]?.close || []).filter(value => typeof value === 'number');
      const price = typeof result?.meta?.regularMarketPrice === 'number'
        ? result.meta.regularMarketPrice
        : closes[closes.length - 1];
      const previous = closes.length > 1 ? closes[closes.length - 2] : result?.meta?.previousClose;

      if (typeof price !== 'number') return null;

      const change = typeof previous === 'number' ? price - previous : null;
      const changePercent = typeof previous === 'number' && previous !== 0 ? (change / previous) * 100 : null;

      return {
        symbol,
        label: labels[symbol] || symbol,
        price,
        change,
        changePercent
      };
    }))).filter(Boolean);

    return res.json({ quotes });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unknown error while fetching market summary.' });
  }
});

function percentChange(current, previous) {
  if (typeof current !== 'number' || typeof previous !== 'number' || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function getCloseAtOffset(closes, offset) {
  if (!closes.length) return null;
  const index = Math.max(0, closes.length - 1 - offset);
  return closes[index];
}

function extractOpenAIText(payload) {
  if (typeof payload.output_text === 'string') return payload.output_text;
  const chunks = [];
  (payload.output || []).forEach(item => {
    (item.content || []).forEach(content => {
      if (typeof content.text === 'string') chunks.push(content.text);
    });
  });
  return chunks.join('\n').trim();
}

async function fetchTickerInsightContext(ticker) {
  const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=6mo&interval=1d`;
  const newsParams = new URLSearchParams({
    q: ticker,
    quotesCount: '0',
    newsCount: '6'
  });
  const newsUrl = `https://query1.finance.yahoo.com/v1/finance/search?${newsParams.toString()}`;

  const [chartResponse, newsResponse] = await Promise.all([
    fetch(chartUrl, { headers: { 'Accept': 'application/json' } }),
    fetch(newsUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      }
    })
  ]);

  if (!chartResponse.ok) {
    throw new Error(`Yahoo Finance chart request failed with status ${chartResponse.status}`);
  }

  const chartPayload = await chartResponse.json();
  const result = chartPayload.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0] || {};
  const timestamps = result?.timestamp || [];
  const closes = (quote.close || []).filter(value => typeof value === 'number');
  const volumes = (quote.volume || []).filter(value => typeof value === 'number');
  const currentPrice = typeof result?.meta?.regularMarketPrice === 'number'
    ? result.meta.regularMarketPrice
    : closes[closes.length - 1];

  if (typeof currentPrice !== 'number' || !closes.length) {
    throw new Error(`Could not build price context for ticker ${ticker}.`);
  }

  let headlines = [];
  if (newsResponse.ok) {
    const newsPayload = await newsResponse.json();
    headlines = (newsPayload.news || [])
      .map(item => ({
        title: item.title,
        publisher: item.publisher,
        publishedAt: item.providerPublishTime
          ? new Date(item.providerPublishTime * 1000).toISOString()
          : null
      }))
      .filter(item => item.title);
  }

  const previousClose = getCloseAtOffset(closes, 1);
  const monthClose = getCloseAtOffset(closes, 21);
  const quarterClose = getCloseAtOffset(closes, 63);
  const recentCloses = closes.slice(-20);
  const quarterCloses = closes.slice(-63);
  const averageVolume = volumes.length
    ? volumes.reduce((sum, volume) => sum + volume, 0) / volumes.length
    : null;

  return {
    ticker,
    currentPrice,
    previousClose,
    oneDayChangePercent: percentChange(currentPrice, previousClose),
    oneMonthChangePercent: percentChange(currentPrice, monthClose),
    threeMonthChangePercent: percentChange(currentPrice, quarterClose),
    twentyDayCloseHigh: recentCloses.length ? Math.max(...recentCloses) : null,
    twentyDayCloseLow: recentCloses.length ? Math.min(...recentCloses) : null,
    threeMonthCloseHigh: quarterCloses.length ? Math.max(...quarterCloses) : null,
    threeMonthCloseLow: quarterCloses.length ? Math.min(...quarterCloses) : null,
    averageVolume,
    firstPriceDate: timestamps[0] ? new Date(timestamps[0] * 1000).toISOString().slice(0, 10) : null,
    lastPriceDate: timestamps[timestamps.length - 1] ? new Date(timestamps[timestamps.length - 1] * 1000).toISOString().slice(0, 10) : null,
    recentHeadlines: headlines
  };
}

app.get('/api/ai-insight', async (req, res) => {
  const ticker = (req.query.ticker || '').trim().toUpperCase();
  if (!ticker) {
    return res.status(400).json({ error: 'Ticker symbol is required.' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not configured on the server.' });
  }

  try {
    const context = await fetchTickerInsightContext(ticker);
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        instructions: [
          'You are a concise equity research assistant for a stock dashboard.',
          'Use only the supplied JSON context. Do not invent fundamentals, ratings, or events.',
          'Avoid investment advice. Frame outputs as research observations, not buy/sell instructions.',
          'For targetLevels, provide priceTarget, buyTarget, and sellTarget as technical watch levels derived from the supplied price context.'
        ].join(' '),
        input: `Create a ticker insight from this context:\n${JSON.stringify(context, null, 2)}`,
        max_output_tokens: 900,
        text: {
          format: {
            type: 'json_schema',
            name: 'ticker_insight',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['summary', 'setup', 'targetLevels', 'bullCase', 'bearCase', 'watchItems', 'riskNote'],
              properties: {
                summary: { type: 'string' },
                setup: { type: 'string' },
                targetLevels: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['priceTarget', 'buyTarget', 'sellTarget'],
                  properties: {
                    priceTarget: {
                      type: 'object',
                      additionalProperties: false,
                      required: ['price', 'rationale'],
                      properties: {
                        price: { type: 'number' },
                        rationale: { type: 'string' }
                      }
                    },
                    buyTarget: {
                      type: 'object',
                      additionalProperties: false,
                      required: ['price', 'rationale'],
                      properties: {
                        price: { type: 'number' },
                        rationale: { type: 'string' }
                      }
                    },
                    sellTarget: {
                      type: 'object',
                      additionalProperties: false,
                      required: ['price', 'rationale'],
                      properties: {
                        price: { type: 'number' },
                        rationale: { type: 'string' }
                      }
                    }
                  }
                },
                bullCase: {
                  type: 'array',
                  minItems: 2,
                  maxItems: 4,
                  items: { type: 'string' }
                },
                bearCase: {
                  type: 'array',
                  minItems: 2,
                  maxItems: 4,
                  items: { type: 'string' }
                },
                watchItems: {
                  type: 'array',
                  minItems: 2,
                  maxItems: 4,
                  items: { type: 'string' }
                },
                riskNote: { type: 'string' }
              }
            }
          }
        }
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({
        error: payload.error?.message || `OpenAI request failed with status ${response.status}`
      });
    }

    const text = extractOpenAIText(payload);
    const insight = JSON.parse(text);
    return res.json({
      ticker,
      generatedAt: new Date().toISOString(),
      insight
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unknown error while generating AI insight.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
