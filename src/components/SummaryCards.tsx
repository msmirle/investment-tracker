"use client";
import { fmtCurrency, fmtPct } from "@/lib/format";
import type { EvaluatedHolding } from "@/lib/types";

export function SummaryCards({ holdings, currency }: { holdings: EvaluatedHolding[]; currency: string }) {
  const totalMarket = holdings.reduce((a, h) => a + (h.marketValue ?? 0), 0);
  const totalBook = holdings.reduce((a, h) => a + (h.bookValue ?? 0), 0);
  const gain = totalMarket - totalBook;
  const gainPct = totalBook > 0 ? (gain / totalBook) * 100 : null;
  const byType = holdings.reduce<Record<string, number>>((acc, h) => {
    acc[h.assetType] = (acc[h.assetType] ?? 0) + (h.marketValue ?? 0);
    return acc;
  }, {});

  const tone = gain >= 0 ? "text-good" : "text-bad";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="card">
        <div className="text-muted text-xs uppercase tracking-widest">Market Value</div>
        <div className="text-3xl font-semibold mt-2 sensitive">{fmtCurrency(totalMarket, currency)}</div>
        <div className="text-xs text-muted mt-1">{holdings.length} holdings</div>
      </div>
      <div className="card">
        <div className="text-muted text-xs uppercase tracking-widest">Book Value</div>
        <div className="text-3xl font-semibold mt-2 sensitive">{fmtCurrency(totalBook, currency)}</div>
        <div className="text-xs text-muted mt-1">Total invested</div>
      </div>
      <div className="card">
        <div className="text-muted text-xs uppercase tracking-widest">Total Gain/Loss</div>
        <div className={`text-3xl font-semibold mt-2 sensitive ${tone}`}>{fmtCurrency(gain, currency)}</div>
        <div className={`text-xs mt-1 sensitive ${tone}`}>{fmtPct(gainPct)}</div>
      </div>
      <div className="card">
        <div className="text-muted text-xs uppercase tracking-widest">Allocation</div>
        <div className="mt-2 space-y-1.5">
          {Object.keys(byType).length === 0 && <div className="text-sm text-muted">No data</div>}
          {Object.entries(byType).map(([type, v]) => {
            const pct = totalMarket > 0 ? (v / totalMarket) * 100 : 0;
            const label = type === "MUTUAL_FUND" ? "MF" : type;
            // Snap to the nearest 5% so the width comes from a static CSS
            // rule (keyed off data-pct) instead of an inline style.
            const bucket = Math.max(0, Math.min(100, Math.round(pct / 5) * 5));
            return (
              <div
                key={type}
                className="flex items-center gap-2 text-sm"
                aria-label={`${label} allocation ${pct.toFixed(0)} percent`}
              >
                <span className="w-14 text-muted">{label}</span>
                <div aria-hidden="true" className="alloc-track" data-pct={bucket}>
                  <div className="alloc-fill" />
                </div>
                <span className="w-12 text-right text-xs">{pct.toFixed(0)}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
