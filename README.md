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

## Run with Docker (Ubuntu / any Linux)

A multi-arch image (linux/amd64 + linux/arm64) is published to GitHub Container Registry on every push to `main`:

```
ghcr.io/spazshark/investment-tracker:latest
```

### One-liner

```bash
docker run -d \
  --name investment-tracker \
  -p 3000:3000 \
  -v investment-tracker-data:/app/data \
  -e AZURE_OPENAI_ENDPOINT="https://<your-aoai>.openai.azure.com/" \
  -e AZURE_OPENAI_API_KEY="<key>" \
  -e AZURE_OPENAI_DEPLOYMENT="gpt-4o" \
  -e AZURE_OPENAI_API_VERSION="2025-03-01-preview" \
  --restart unless-stopped \
  ghcr.io/spazshark/investment-tracker:latest
```

The SQLite database lives on the named volume `investment-tracker-data` (mounted at `/app/data` inside the container) so it survives container upgrades. AI features (Statement Analyzer, Advisor) are optional — omit the env vars to disable them.

### Or with docker compose

A ready-made `docker-compose.yml` is included. Put your AI keys in a sibling `.env` file and run:

```bash
docker compose pull
docker compose up -d
```

### Pulling from GHCR

The package is private by default. Either make it public on GitHub (Packages → settings) or authenticate:

```bash
echo "$GHCR_PAT" | docker login ghcr.io -u <github-user> --password-stdin
```

A classic personal-access token with `read:packages` is sufficient.
