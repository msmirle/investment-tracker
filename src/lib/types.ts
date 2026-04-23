export interface EvaluatedHolding {
  id: string;
  symbol: string;
  name: string;
  assetType: "STOCK" | "ETF" | "CRYPTO";
  quantity: number;
  costBasis: number;
  costCurrency: string;
  currentPrice: number | null;
  priceCurrency: string | null;
  marketValue: number | null;
  bookValue: number;
  gain: number | null;
  gainPct: number | null;
  realizedGain?: number;
  txCount?: number;
  displayCurrency: string;
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
