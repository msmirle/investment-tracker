"use client";
import { fmtCurrency, fmtNumber, fmtPct } from "@/lib/format";
import type { EvaluatedHolding } from "@/lib/types";

interface Props {
  positions: EvaluatedHolding[];
  currency: string;
}

const typeColors: Record<string, string> = {
  STOCK: "bg-indigo-500/20 text-indigo-300",
  ETF: "bg-cyan-500/20 text-cyan-300",
  CRYPTO: "bg-amber-500/20 text-amber-300",
};

export function PositionsTable({ positions, currency }: Props) {
  if (positions.length === 0) {
    return (
      <div className="card text-center py-12">
        <div className="text-lg font-medium">No open positions</div>
        <div className="text-muted text-sm mt-1">Add a transaction below to get started.</div>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-panel2/60 text-muted text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-5 py-3">Symbol</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-left px-4 py-3">Firm</th>
              <th className="text-left px-4 py-3">Account #</th>
              <th className="text-right px-4 py-3">Quantity</th>
              <th className="text-right px-4 py-3">Avg Cost</th>
              <th className="text-right px-4 py-3">Price</th>
              <th className="text-right px-4 py-3">Market Value</th>
              <th className="text-right px-4 py-3">Book Value</th>
              <th className="text-right px-4 py-3">Unrealized</th>
              <th className="text-right px-4 py-3">Realized</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((h) => {
              const tone = (h.gain ?? 0) >= 0 ? "text-good" : "text-bad";
              const avgCost = h.quantity > 0 ? h.costBasis / h.quantity : 0;
              const realizedTone = (h.realizedGain ?? 0) >= 0 ? "text-good" : "text-bad";
              return (
                <tr key={h.id} className="border-t border-border/60 hover:bg-panel2/40 transition">
                  <td className="px-5 py-3">
                    <div className="font-semibold">{h.symbol}</div>
                    <div className="text-xs text-muted truncate max-w-[16rem]">{h.name}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`pill ${typeColors[h.assetType] ?? "bg-slate-500/20 text-slate-300"}`}>
                      {h.assetType}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">{h.firm || "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted tabular-nums">{h.accountNumber || "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtNumber(h.quantity, 6)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted">
                    {fmtCurrency(avgCost, h.costCurrency)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {h.currentPrice !== null
                      ? fmtCurrency(h.currentPrice, h.priceCurrency || "USD")
                      : <span className="text-bad text-xs">{h.error || "—"}</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {h.currentPrice !== null
                      ? fmtCurrency(h.quantity * h.currentPrice, h.priceCurrency || currency)
                      : fmtCurrency(h.marketValue, currency)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted">
                    {fmtCurrency(h.costBasis, h.costCurrency)}
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums ${tone}`}>
                    <div className="font-medium">{fmtCurrency(h.gain, currency)}</div>
                    <div className="text-xs">{fmtPct(h.gainPct)}</div>
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums ${realizedTone}`}>
                    {fmtCurrency(h.realizedGain ?? 0, currency)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
