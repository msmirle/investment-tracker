export interface EvaluatedHolding {
  id: string;
  symbol: string;
  name: string;
  assetType: "STOCK" | "ETF" | "CRYPTO" | "MUTUAL_FUND";
  quantity: number;
  costBasis: number;
  costCurrency: string;
  currentPrice: number | null;
  priceCurrency: string | null;
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
