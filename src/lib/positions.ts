// Portfolio/position aggregation from transactions.
// Uses weighted average cost accounting.

import type { AssetType, SymbolOverride } from "./prices";
import { getQuotes, getFxRate, getHistory } from "./prices";
import { prisma } from "./prisma";

async function loadSymbolOverrides(symbols: string[]): Promise<Record<string, SymbolOverride>> {
  if (symbols.length === 0) return {};
  const rows = await prisma.symbolMeta.findMany({
    where: { symbol: { in: Array.from(new Set(symbols.map((s) => s.toUpperCase()))) } },
  });
  const out: Record<string, SymbolOverride> = {};
  for (const r of rows) {
    out[r.symbol.toUpperCase()] = {
      quoteSymbol: r.quoteSymbol,
      manualPrice: r.manualPrice,
      manualPriceCurrency: r.manualPriceCurrency,
    };
  }
  return out;
}

export interface TransactionRow {
  id: string;
  symbol: string;
  name?: string | null;
  assetType: string;
  action: string; // BUY | SELL
  quantity: number;
  price: number;
  fees: number;
  currency: string;
  account?: string | null;
  firm?: string | null;
  accountNumber?: string | null;
  orderType?: string | null;
  executedAt: Date | string;
  notes?: string | null;
}

export interface Position {
  key: string; // symbol|assetType|currency|firm|accountNumber
  symbol: string;
  name: string | null;
  assetType: AssetType;
  quantity: number;
  costBasis: number; // total in `currency`
  currency: string;
  firm: string | null;
  accountNumber: string | null;
  realizedGain: number; // in `currency`
  txCount: number;
}

function asAssetType(v: string): AssetType {
  const u = v.toUpperCase();
  if (u === "STOCK" || u === "ETF" || u === "CRYPTO" || u === "MUTUAL_FUND") return u;
  return "STOCK";
}

// Aggregate a list of transactions into per-symbol/currency positions using
// weighted-average-cost method. Returns positions with quantity > 0.
export function aggregateTransactions(txs: TransactionRow[]): Position[] {
  // Sort by executedAt ascending so BUY/SELL order is correct.
  const sorted = [...txs].sort((a, b) => {
    const da = new Date(a.executedAt).getTime();
    const db = new Date(b.executedAt).getTime();
    return da - db;
  });

  const map = new Map<string, Position>();
  for (const tx of sorted) {
    const assetType = asAssetType(tx.assetType);
    const currency = tx.currency.toUpperCase();
    const symbol = tx.symbol.toUpperCase();
    const firm = tx.firm?.trim() || null;
    const accountNumber = tx.accountNumber?.trim() || null;
    const key = `${symbol}|${assetType}|${currency}|${firm ?? ""}|${accountNumber ?? ""}`;
    const current: Position = map.get(key) ?? {
      key,
      symbol,
      name: tx.name ?? null,
      assetType,
      quantity: 0,
      costBasis: 0,
      currency,
      firm,
      accountNumber,
      realizedGain: 0,
      txCount: 0,
    };

    const qty = Number(tx.quantity) || 0;
    const price = Number(tx.price) || 0;
    const fees = Number(tx.fees) || 0;

    if (tx.action.toUpperCase() === "SELL") {
      const avgCost = current.quantity > 0 ? current.costBasis / current.quantity : 0;
      const soldCost = avgCost * qty;
      const proceeds = qty * price - fees;
      current.realizedGain += proceeds - soldCost;
      current.quantity -= qty;
      current.costBasis -= soldCost;
      if (current.quantity < 1e-9) current.quantity = 0;
      if (current.costBasis < 0) current.costBasis = 0;
    } else {
      // BUY — fees/commissions are treated as a separate expense, not part
      // of per-share cost basis, so average cost reflects the price paid
      // per share (adjusted for splits).
      current.quantity += qty;
      current.costBasis += qty * price;
      current.realizedGain -= fees;
    }
    current.name = tx.name ?? current.name;
    current.txCount += 1;
    map.set(key, current);
  }

  return Array.from(map.values()).filter((p) => p.quantity > 1e-9);
}

// --- Evaluation with live prices and FX conversion --------------------

export interface EvaluatedPosition {
  id: string;
  symbol: string;
  name: string;
  assetType: AssetType;
  quantity: number;
  costBasis: number;   // in costCurrency
  costCurrency: string;
  currentPrice: number | null;
  priceCurrency: string | null;
  marketValue: number | null; // in displayCurrency
  bookValue: number;           // in displayCurrency
  gain: number | null;
  gainPct: number | null;
  realizedGain: number;        // in displayCurrency
  displayCurrency: string;
  firm: string | null;
  accountNumber: string | null;
  txCount: number;
  error?: string;
}

export async function evaluatePositions(
  positions: Position[],
  displayCurrency: string,
): Promise<EvaluatedPosition[]> {
  const overrides = await loadSymbolOverrides(positions.map((p) => p.symbol));
  const quotes = await getQuotes(
    positions.map((p) => ({
      symbol: p.symbol,
      assetType: p.assetType,
      override: overrides[p.symbol.toUpperCase()],
    })),
  );

  // FX rates
  const fxKeys = new Set<string>();
  for (const p of positions) fxKeys.add(p.currency);
  for (const key of Object.keys(quotes)) fxKeys.add(quotes[key].currency);
  const fxRates: Record<string, number> = {};
  await Promise.all(
    Array.from(fxKeys).map(async (c) => {
      try {
        fxRates[c] = await getFxRate(c, displayCurrency);
      } catch {
        fxRates[c] = NaN;
      }
    }),
  );

  return positions.map((p) => {
    const q = quotes[`${p.assetType}:${p.symbol}`];
    const bookFx = fxRates[p.currency] ?? NaN;
    const bookValue = p.costBasis * bookFx;
    const realizedGain = p.realizedGain * bookFx;

    if (!q) {
      return {
        id: p.key,
        symbol: p.symbol,
        name: p.name || p.symbol,
        assetType: p.assetType,
        quantity: p.quantity,
        costBasis: p.costBasis,
        costCurrency: p.currency,
        currentPrice: null,
        priceCurrency: null,
        marketValue: null,
        bookValue: isFinite(bookValue) ? bookValue : 0,
        gain: null,
        gainPct: null,
        realizedGain: isFinite(realizedGain) ? realizedGain : 0,
        displayCurrency,
        firm: p.firm,
        accountNumber: p.accountNumber,
        txCount: p.txCount,
        error: "No price available",
      };
    }
    const priceFx = fxRates[q.currency] ?? NaN;
    const marketValue = p.quantity * q.price * priceFx;
    const gain = marketValue - bookValue;
    const gainPct = bookValue > 0 ? (gain / bookValue) * 100 : null;
    return {
      id: p.key,
      symbol: p.symbol,
      name: p.name || q.name || p.symbol,
      assetType: p.assetType,
      quantity: p.quantity,
      costBasis: p.costBasis,
      costCurrency: p.currency,
      currentPrice: q.price,
      priceCurrency: q.currency,
      marketValue: isFinite(marketValue) ? marketValue : null,
      bookValue: isFinite(bookValue) ? bookValue : 0,
      gain: isFinite(gain) ? gain : null,
      gainPct,
      realizedGain: isFinite(realizedGain) ? realizedGain : 0,
      displayCurrency,
      firm: p.firm,
      accountNumber: p.accountNumber,
      txCount: p.txCount,
    };
  });
}

// --- Portfolio value time series --------------------------------------

export interface PortfolioHistoryPoint {
  date: string;
  value: number;
}

export async function portfolioHistory(
  positions: Position[],
  displayCurrency: string,
  days: number,
): Promise<PortfolioHistoryPoint[]> {
  if (positions.length === 0) return [];
  const overrides = await loadSymbolOverrides(positions.map((p) => p.symbol));
  const series = await Promise.all(
    positions.map(async (p) => {
      try {
        const hist = await getHistory(
          p.symbol,
          p.assetType,
          days,
          overrides[p.symbol.toUpperCase()],
        );
        return { position: p, hist };
      } catch {
        return { position: p, hist: [] as Array<{ date: string; close: number }> };
      }
    }),
  );

  const fxNeeded = new Set<string>();
  fxNeeded.add("USD");
  for (const s of series) fxNeeded.add(s.position.currency);
  const fxRates: Record<string, number> = {};
  await Promise.all(
    Array.from(fxNeeded).map(async (c) => {
      try {
        fxRates[c] = await getFxRate(c, displayCurrency);
      } catch {
        fxRates[c] = 1;
      }
    }),
  );

  const totalsByDate = new Map<string, number>();
  for (const s of series) {
    const fx = s.position.assetType === "CRYPTO"
      ? fxRates["USD"] ?? 1
      : fxRates[s.position.currency] ?? 1;
    for (const pt of s.hist) {
      const v = s.position.quantity * pt.close * fx;
      totalsByDate.set(pt.date, (totalsByDate.get(pt.date) ?? 0) + v);
    }
  }
  return Array.from(totalsByDate.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, value]) => ({ date, value }));
}
