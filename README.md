# Portfolio Tracker

A self-hosted web app to track **stocks, ETFs, and crypto** in one place. You enter what you've bought and what you paid — the app fetches live market prices and visualizes your book value, current market value, gain/loss, allocation, and historical performance.

## Features

- Holdings table with live prices, gain/loss, and per-position detail
- Summary cards: total market value, book value, total gain/loss, allocation by type
- Donut chart of allocation by holding
- Historical performance area chart (1M → 5Y)
- Multi-currency: store each holding in its native currency, display totals in any supported currency
- CSV import for bulk loading
- Dark, responsive UI (Tailwind + Recharts)
- Local SQLite database — your data stays on your machine

## Quick start

```powershell
cd investment-tracker
npm install
npx prisma db push   # creates prisma/dev.db
npm run dev
```

Then open http://localhost:3000.

## Data sources

- **Stocks / ETFs / FX**: Yahoo Finance (via `yahoo-finance2` — no API key)
- **Crypto**: CoinGecko public API (no API key). Common tickers (`BTC`, `ETH`, etc.) are pre-mapped; others resolve via search.

No credentials are required.

## CSV import format

Headers (case-insensitive): `symbol, assetType, quantity, costBasis, currency, name, purchaseDate, notes`.

- `assetType` must be `STOCK`, `ETF`, or `CRYPTO`.
- `costBasis` is the total amount you paid (not per-share).
- `currency` defaults to `USD`.

See [`sample-holdings.csv`](sample-holdings.csv) for an example.

## Notes

- Market prices are cached in-memory for ~60 seconds to avoid upstream rate limits.
- The historical chart uses today's FX rate to convert each asset's historical native-currency prices into the display currency; this is a reasonable approximation, not a strict daily-FX reconstruction.
- Yahoo Finance is an unofficial source and may occasionally rate-limit or break. For crypto, CoinGecko's free tier is generous but rate-limited.
- This app is for personal tracking and is not financial advice.
