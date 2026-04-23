// Price and FX service.
// - Stocks/ETFs/FX: Yahoo's public v8 chart endpoint (no API key, no crumb needed).
// - Crypto: CoinGecko public API.
// Results are cached in-memory with short TTLs to avoid hammering upstreams.

export type AssetType = "STOCK" | "ETF" | "CRYPTO";

export interface Quote {
  symbol: string;
  price: number;
  currency: string;
  name?: string;
}

// --- Simple TTL cache ---------------------------------------------------
type CacheEntry<T> = { value: T; expires: number };
const cache = new Map<string, CacheEntry<unknown>>();

async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await fn();
  cache.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}

const YAHOO_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  accept: "application/json",
};

interface YahooChartMeta {
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  currency?: string;
  symbol?: string;
  shortName?: string;
  longName?: string;
  instrumentType?: string;
}
interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: YahooChartMeta;
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }>;
    error?: { code: string; description: string } | null;
  };
}

async function yahooChart(
  symbol: string,
  params: { range?: string; interval?: string; period1?: number; period2?: number } = {},
): Promise<YahooChartResponse> {
  const q = new URLSearchParams();
  q.set("interval", params.interval ?? "1d");
  if (params.period1 && params.period2) {
    q.set("period1", String(params.period1));
    q.set("period2", String(params.period2));
  } else {
    q.set("range", params.range ?? "1d");
  }
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${q}`;
  const res = await fetch(url, { headers: YAHOO_HEADERS });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status} for ${symbol}`);
  const data = (await res.json()) as YahooChartResponse;
  if (data.chart?.error) {
    throw new Error(`Yahoo error for ${symbol}: ${data.chart.error.description}`);
  }
  return data;
}

// --- CoinGecko symbol → id resolution ----------------------------------
const STATIC_CG_MAP: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  ADA: "cardano",
  DOGE: "dogecoin",
  XRP: "ripple",
  DOT: "polkadot",
  MATIC: "polygon-ecosystem-token",
  LTC: "litecoin",
  BCH: "bitcoin-cash",
  AVAX: "avalanche-2",
  LINK: "chainlink",
  UNI: "uniswap",
  ATOM: "cosmos",
  XLM: "stellar",
  ALGO: "algorand",
  USDT: "tether",
  USDC: "usd-coin",
};

async function resolveCoinId(symbol: string): Promise<string> {
  const upper = symbol.toUpperCase();
  if (STATIC_CG_MAP[upper]) return STATIC_CG_MAP[upper];
  return cached(`cg:search:${upper}`, 24 * 60 * 60 * 1000, async () => {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(symbol)}`,
      { headers: { accept: "application/json" } },
    );
    if (!res.ok) throw new Error(`CoinGecko search failed: ${res.status}`);
    const data = (await res.json()) as {
      coins: Array<{ id: string; symbol: string; name: string; market_cap_rank: number | null }>;
    };
    const exact = data.coins
      .filter((c) => c.symbol.toUpperCase() === upper)
      .sort((a, b) => (a.market_cap_rank ?? 9999) - (b.market_cap_rank ?? 9999))[0];
    if (exact) return exact.id;
    if (data.coins[0]) return data.coins[0].id;
    throw new Error(`Unknown crypto symbol: ${symbol}`);
  });
}

// --- Quote fetching -----------------------------------------------------
export interface SymbolOverride {
  quoteSymbol?: string | null;
  manualPrice?: number | null;
  manualPriceCurrency?: string | null;
}

export async function getQuote(
  symbol: string,
  assetType: AssetType,
  override?: SymbolOverride,
): Promise<Quote> {
  // Manual price takes top priority — no network call.
  if (override?.manualPrice != null && isFinite(override.manualPrice)) {
    return {
      symbol: symbol.toUpperCase(),
      price: override.manualPrice,
      currency: (override.manualPriceCurrency ?? "USD").toUpperCase(),
    };
  }
  const fetchSymbol = (override?.quoteSymbol && override.quoteSymbol.trim()) || symbol;

  if (assetType === "CRYPTO") {
    return cached(`quote:crypto:${fetchSymbol.toUpperCase()}`, 60_000, async () => {
      const id = await resolveCoinId(fetchSymbol);
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
        { headers: { accept: "application/json" } },
      );
      if (!res.ok) throw new Error(`CoinGecko price failed: ${res.status}`);
      const data = (await res.json()) as Record<string, { usd: number }>;
      const price = data[id]?.usd;
      if (typeof price !== "number") throw new Error(`No price for ${fetchSymbol}`);
      return { symbol: symbol.toUpperCase(), price, currency: "USD", name: id };
    });
  }
  return cached(`quote:eq:${fetchSymbol.toUpperCase()}`, 60_000, async () => {
    const data = await yahooChart(fetchSymbol, { range: "1d", interval: "1d" });
    const meta = data.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice ?? meta?.chartPreviousClose;
    if (typeof price !== "number") throw new Error(`No price for ${fetchSymbol}`);
    return {
      symbol: symbol.toUpperCase(),
      price,
      currency: (meta?.currency ?? "USD").toUpperCase(),
      name: meta?.shortName ?? meta?.longName ?? undefined,
    };
  });
}

export async function getQuotes(
  items: Array<{ symbol: string; assetType: AssetType; override?: SymbolOverride }>,
): Promise<Record<string, Quote>> {
  const unique = new Map<string, { symbol: string; assetType: AssetType; override?: SymbolOverride }>();
  for (const it of items) unique.set(`${it.assetType}:${it.symbol.toUpperCase()}`, it);
  const results = await Promise.allSettled(
    Array.from(unique.values()).map(
      async (it) => [it, await getQuote(it.symbol, it.assetType, it.override)] as const,
    ),
  );
  const out: Record<string, Quote> = {};
  for (const r of results) {
    if (r.status === "fulfilled") {
      const [it, q] = r.value;
      out[`${it.assetType}:${it.symbol.toUpperCase()}`] = q;
    } else {
      // Surface the reason in dev logs so failures aren't silent.
      console.warn("[prices] quote failed:", r.reason);
    }
  }
  return out;
}

// --- FX conversion ------------------------------------------------------
export async function getFxRate(from: string, to: string): Promise<number> {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  if (f === t) return 1;
  return cached(`fx:${f}:${t}`, 60 * 60_000, async () => {
    // Yahoo uses e.g. EURUSD=X
    try {
      const data = await yahooChart(`${f}${t}=X`, { range: "1d", interval: "1d" });
      const rate = data.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (typeof rate === "number") return rate;
    } catch {
      // fall through
    }
    // Fallback: exchangerate.host (no key)
    const res = await fetch(`https://api.exchangerate.host/convert?from=${f}&to=${t}`);
    if (!res.ok) throw new Error(`FX lookup failed ${f}->${t}`);
    const data = (await res.json()) as { result?: number };
    if (typeof data.result === "number") return data.result;
    throw new Error(`Unable to determine FX ${f}->${t}`);
  });
}

// --- Historical time-series ---------------------------------------------
export interface HistoryPoint {
  date: string; // YYYY-MM-DD
  close: number;
}

export async function getHistory(
  symbol: string,
  assetType: AssetType,
  days: number,
  override?: SymbolOverride,
): Promise<HistoryPoint[]> {
  // Manual-priced symbols have no history series; skip network.
  if (override?.manualPrice != null) return [];
  const fetchSymbol = (override?.quoteSymbol && override.quoteSymbol.trim()) || symbol;
  const key = `hist:${assetType}:${fetchSymbol.toUpperCase()}:${days}`;
  return cached(key, 6 * 60 * 60_000, async () => {
    if (assetType === "CRYPTO") {
      const id = await resolveCoinId(fetchSymbol);
      const res = await fetch(
        `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}&interval=daily`,
        { headers: { accept: "application/json" } },
      );
      if (!res.ok) throw new Error(`CoinGecko history failed: ${res.status}`);
      const data = (await res.json()) as { prices: Array<[number, number]> };
      return data.prices.map(([ts, close]) => ({
        date: new Date(ts).toISOString().slice(0, 10),
        close,
      }));
    }
    const end = Math.floor(Date.now() / 1000);
    const start = end - days * 24 * 60 * 60;
    const data = await yahooChart(fetchSymbol, { period1: start, period2: end, interval: "1d" });
    const result = data.chart?.result?.[0];
    const timestamps = result?.timestamp ?? [];
    const closes = result?.indicators?.quote?.[0]?.close ?? [];
    const out: HistoryPoint[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const close = closes[i];
      if (typeof close === "number") {
        out.push({
          date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
          close,
        });
      }
    }
    return out;
  });
}
