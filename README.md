# Stock OHLC Chart

A simple website that takes a ticker symbol, fetches enough OHLC price history from Yahoo Finance to calculate 50- and 100-day EMAs, and charts the latest 100 trading days.

## Run locally

1. Open a terminal in `/Users/ramsingh/stock-chart-site`
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   npm start
   ```
4. Open `http://localhost:3000` in your browser.

## Notes

- The app uses an Express backend to proxy Yahoo Finance data and avoid browser CORS issues.
- The chart is rendered with Chart.js and the chartjs-chart-financial plugin.
