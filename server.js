const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
let yahooSession = null;

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

    return res.json({ ticker, data });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unknown error while fetching data.' });
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

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
