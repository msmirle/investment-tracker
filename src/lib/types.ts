export interface EvaluatedHolding {
  id: string;
  symbol: string;
  name: string;
  assetType: "STOCK" | "ETF" | "CRYPTO" | "MUTUAL_FUND" | "PRIVATE_EQUITY";
  quantity: number;
  costBasis: number;
  costCurrency: string;
  currentPrice: number | null;
  priceCurrency: string | null;
  /** Epoch ms; upstream market time for live quotes, fetch time otherwise. Null = manual override or unavailable. */
  priceAsOf?: number | null;
  previousClose?: number | null;
  dayChange?: number | null;
  dayChangePct?: number | null;
  marketValue: number | null;
  bookValue: number;
  gain: number | null;
  gainPct: number | null;
  realizedGain?: number;
  txCount?: number;
  displayCurrency: string;
  firm?: string | null;
  accountNumber?: string | null;
  error?: string;
}

export interface PortfolioResponse {
  displayCurrency: string;
  holdings: EvaluatedHolding[];
}

export interface HistoryResponse {
  displayCurrency: string;
  days: number;
  series: Array<{ date: string; value: number }>;
}
