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
        <div className="text-3xl font-semibold mt-2">{fmtCurrency(totalMarket, currency)}</div>
        <div className="text-xs text-muted mt-1">{holdings.length} holdings</div>
      </div>
      <div className="card">
        <div className="text-muted text-xs uppercase tracking-widest">Book Value</div>
        <div className="text-3xl font-semibold mt-2">{fmtCurrency(totalBook, currency)}</div>
        <div className="text-xs text-muted mt-1">Total invested</div>
      </div>
      <div className="card">
        <div className="text-muted text-xs uppercase tracking-widest">Total Gain/Loss</div>
        <div className={`text-3xl font-semibold mt-2 ${tone}`}>{fmtCurrency(gain, currency)}</div>
        <div className={`text-xs mt-1 ${tone}`}>{fmtPct(gainPct)}</div>
      </div>
      <div className="card">
        <div className="text-muted text-xs uppercase tracking-widest">Allocation</div>
        <div className="mt-2 space-y-1.5">
          {Object.keys(byType).length === 0 && <div className="text-sm text-muted">No data</div>}
          {Object.entries(byType).map(([type, v]) => {
            const pct = totalMarket > 0 ? (v / totalMarket) * 100 : 0;
            return (
              <div key={type} className="flex items-center gap-2 text-sm">
                <span className="w-14 text-muted">{type}</span>
                <div
                  className="flex-1 bg-panel2 rounded-full h-2 overflow-hidden"
                  role="progressbar"
                  aria-valuenow={Math.round(pct)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full bg-gradient-to-r from-accent to-accent2 transition-all"
                    /* eslint-disable-next-line react/forbid-dom-props */
                    style={{ width: `${pct.toFixed(1)}%` }}
                  />
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
