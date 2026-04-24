"use client";
import { fmtCurrency, fmtNumber } from "@/lib/format";
import type { Transaction } from "@/lib/transaction-types";

interface Props {
  transactions: Transaction[];
  onEdit: (t: Transaction) => void;
  onDelete: (id: string) => void;
}

const typeColors: Record<string, string> = {
  STOCK: "bg-indigo-500/20 text-indigo-300",
  ETF: "bg-cyan-500/20 text-cyan-300",
  CRYPTO: "bg-amber-500/20 text-amber-300",
  MUTUAL_FUND: "bg-emerald-500/20 text-emerald-300",
};

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TransactionsTable({ transactions, onEdit, onDelete }: Props) {
  if (transactions.length === 0) {
    return (
      <div className="card text-center py-10">
        <div className="text-muted text-sm">No transactions yet.</div>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-panel2/60 text-muted text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-5 py-3">Time Placed</th>
              <th className="text-left px-4 py-3">Action</th>
              <th className="text-left px-4 py-3">Symbol</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-right px-4 py-3">Quantity</th>
              <th className="text-right px-4 py-3">Fill Price</th>
              <th className="text-right px-4 py-3">Fees</th>
              <th className="text-right px-4 py-3">Total</th>
              <th className="text-left px-4 py-3">Order</th>
              <th className="text-left px-4 py-3">Firm</th>
              <th className="text-left px-4 py-3">Account #</th>
              <th className="text-left px-4 py-3">Account</th>
              <th className="text-right px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => {
              const total = t.quantity * t.price + (t.action === "BUY" ? t.fees : -t.fees);
              const actionTone = t.action === "BUY" ? "bg-good/20 text-good" : "bg-bad/20 text-bad";
              return (
                <tr key={t.id} className="border-t border-border/60 hover:bg-panel2/40 transition">
                  <td className="px-5 py-3 whitespace-nowrap text-muted text-xs">
                    {fmtDateTime(t.executedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`pill ${actionTone}`}>{t.action}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold">{t.symbol}</div>
                    {t.name && (
                      <div className="text-xs text-muted truncate max-w-[14rem]">{t.name}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`pill ${typeColors[t.assetType] ?? "bg-slate-500/20 text-slate-300"}`}>
                      {t.assetType}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtNumber(t.quantity, 6)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {fmtCurrency(t.price, t.currency)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted">
                    {t.fees ? fmtCurrency(t.fees, t.currency) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {fmtCurrency(total, t.currency)}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">{t.orderType || "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted">{t.firm || "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted tabular-nums">{t.accountNumber || "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted truncate max-w-[12rem]">
                    {t.account || "—"}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => onEdit(t)}
                      className="text-muted hover:text-accent2 transition text-xs mr-3"
                      aria-label={`Edit transaction ${t.symbol}`}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete this ${t.action} ${t.symbol} transaction?`)) onDelete(t.id);
                      }}
                      className="text-muted hover:text-bad transition text-xs"
                      aria-label={`Delete transaction ${t.symbol}`}
                    >
                      Delete
                    </button>
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
