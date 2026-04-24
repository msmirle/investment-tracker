"use client";
import { useRef, useState } from "react";
import { fmtCurrency, fmtNumber } from "@/lib/format";

interface ProposedTx {
  symbol: string;
  name?: string | null;
  assetType: "STOCK" | "ETF" | "CRYPTO" | "MUTUAL_FUND";
  action: "BUY" | "SELL" | "DIST";
  quantity: number;
  price: number;
  fees?: number | null;
  currency: string;
  firm?: string | null;
  accountNumber?: string | null;
  executedAt: string;
  notes?: string | null;
}

interface PositionChange {
  key: string;
  symbol: string;
  firm: string | null;
  accountNumber: string | null;
  currency: string;
  beforeQty: number;
  afterQty: number;
  beforeBook: number;
  afterBook: number;
  beforeRealized: number;
  afterRealized: number;
}

interface AnalysisResult {
  statementSummary: string;
  newTransactions: ProposedTx[];
  duplicateTransactions: ProposedTx[];
  positionChanges: PositionChange[];
}

export function StatementImport({ onImported }: { onImported: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [filename, setFilename] = useState<string>("");

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    setBusy(true);
    setStatus("Analyzing statement with AI…");
    setAnalysis(null);
    try {
      const fd = new FormData();
      fd.append("file", file, file.name);
      const res = await fetch("/api/analyze-statement", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      setAnalysis(data as AnalysisResult);
      setSelected(new Set((data as AnalysisResult).newTransactions.map((_, i) => i)));
      setStatus(null);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function confirm() {
    if (!analysis) return;
    const chosen = analysis.newTransactions.filter((_, i) => selected.has(i));
    if (chosen.length === 0) {
      setAnalysis(null);
      return;
    }
    setBusy(true);
    setStatus("Adding transactions…");
    try {
      const res = await fetch("/api/transactions/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transactions: chosen }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setStatus(
        `Added ${data.createdCount} transactions` +
          (data.errors?.length ? ` (${data.errors.length} errors)` : ""),
      );
      setAnalysis(null);
      onImported();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function toggleAll() {
    if (!analysis) return;
    setSelected((prev) =>
      prev.size === analysis.newTransactions.length
        ? new Set()
        : new Set(analysis.newTransactions.map((_, i) => i)),
    );
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          title="Upload a brokerage or fund statement (PDF) and have AI extract transactions"
        >
          {busy ? "Analyzing…" : "Analyze Statement (AI)"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          title="Choose a PDF statement"
          aria-label="Choose a PDF statement to analyze"
          onChange={onFile}
        />
        {status && !analysis && <span className="text-xs text-muted">{status}</span>}
      </div>

      {analysis && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
          <div className="card w-full max-w-4xl my-8 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">Review AI-extracted transactions</h3>
                <p className="text-xs text-muted mt-1">{filename}</p>
                <p className="text-sm mt-2">{analysis.statementSummary}</p>
              </div>
              <button
                type="button"
                className="btn-ghost text-xs"
                onClick={() => setAnalysis(null)}
                disabled={busy}
              >
                Cancel
              </button>
            </div>

            <section>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold">
                  New transactions ({analysis.newTransactions.length})
                </h4>
                {analysis.newTransactions.length > 0 && (
                  <button type="button" className="text-xs text-muted hover:text-fg" onClick={toggleAll}>
                    {selected.size === analysis.newTransactions.length ? "Deselect all" : "Select all"}
                  </button>
                )}
              </div>
              {analysis.newTransactions.length === 0 ? (
                <p className="text-xs text-muted">No new transactions found.</p>
              ) : (
                <div className="overflow-x-auto border border-border rounded">
                  <table className="w-full text-xs">
                    <thead className="bg-panel2/60 text-muted uppercase tracking-wider">
                      <tr>
                        <th className="px-2 py-2 w-8"></th>
                        <th className="text-left px-2 py-2">Date</th>
                        <th className="text-left px-2 py-2">Symbol</th>
                        <th className="text-left px-2 py-2">Type</th>
                        <th className="text-left px-2 py-2">Action</th>
                        <th className="text-right px-2 py-2">Qty</th>
                        <th className="text-right px-2 py-2">Price</th>
                        <th className="text-right px-2 py-2">Fees</th>
                        <th className="text-left px-2 py-2">Firm</th>
                        <th className="text-left px-2 py-2">Account</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.newTransactions.map((t, i) => (
                        <tr key={i} className="border-t border-border/60">
                          <td className="px-2 py-1.5">
                            <input
                              type="checkbox"
                              checked={selected.has(i)}
                              onChange={() => toggle(i)}
                              aria-label={`Include ${t.symbol} ${t.action}`}
                            />
                          </td>
                          <td className="px-2 py-1.5 tabular-nums">{t.executedAt.slice(0, 10)}</td>
                          <td className="px-2 py-1.5 font-semibold">{t.symbol}</td>
                          <td className="px-2 py-1.5">{t.assetType === "MUTUAL_FUND" ? "MF" : t.assetType}</td>
                          <td className="px-2 py-1.5">{t.action}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{fmtNumber(t.quantity, 6)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {fmtCurrency(t.price, t.currency)}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-muted">
                            {t.fees ? fmtCurrency(t.fees, t.currency) : "—"}
                          </td>
                          <td className="px-2 py-1.5 text-muted">{t.firm || "—"}</td>
                          <td className="px-2 py-1.5 text-muted">{t.accountNumber || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {analysis.duplicateTransactions.length > 0 && (
              <section>
                <h4 className="text-sm font-semibold mb-2">
                  Skipped as duplicates ({analysis.duplicateTransactions.length})
                </h4>
                <ul className="text-xs text-muted space-y-1">
                  {analysis.duplicateTransactions.map((t, i) => (
                    <li key={i}>
                      {t.executedAt.slice(0, 10)} · {t.symbol} · {t.action} · {fmtNumber(t.quantity, 6)} @ {fmtCurrency(t.price, t.currency)}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {analysis.positionChanges.length > 0 && (
              <section>
                <h4 className="text-sm font-semibold mb-2">
                  Position changes ({analysis.positionChanges.length})
                </h4>
                <div className="overflow-x-auto border border-border rounded">
                  <table className="w-full text-xs">
                    <thead className="bg-panel2/60 text-muted uppercase tracking-wider">
                      <tr>
                        <th className="text-left px-2 py-2">Symbol</th>
                        <th className="text-left px-2 py-2">Firm / Acct</th>
                        <th className="text-right px-2 py-2">Qty (before → after)</th>
                        <th className="text-right px-2 py-2">Book value (before → after)</th>
                        <th className="text-right px-2 py-2">Realized (before → after)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.positionChanges.map((c) => {
                        const qtyChanged = Math.abs(c.beforeQty - c.afterQty) > 1e-9;
                        const bookChanged = Math.abs(c.beforeBook - c.afterBook) > 1e-4;
                        const realizedChanged =
                          Math.abs(c.beforeRealized - c.afterRealized) > 1e-4;
                        return (
                          <tr key={c.key} className="border-t border-border/60">
                            <td className="px-2 py-1.5 font-semibold">{c.symbol}</td>
                            <td className="px-2 py-1.5 text-muted">
                              {c.firm || "—"}
                              {c.accountNumber ? ` · ${c.accountNumber}` : ""}
                            </td>
                            <td className={`px-2 py-1.5 text-right tabular-nums ${qtyChanged ? "" : "text-muted"}`}>
                              {fmtNumber(c.beforeQty, 6)} → {fmtNumber(c.afterQty, 6)}
                            </td>
                            <td className={`px-2 py-1.5 text-right tabular-nums ${bookChanged ? "" : "text-muted"}`}>
                              {fmtCurrency(c.beforeBook, c.currency)} → {fmtCurrency(c.afterBook, c.currency)}
                            </td>
                            <td className={`px-2 py-1.5 text-right tabular-nums ${realizedChanged ? "" : "text-muted"}`}>
                              {fmtCurrency(c.beforeRealized, c.currency)} → {fmtCurrency(c.afterRealized, c.currency)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-border">
              {status && <span className="text-xs text-muted">{status}</span>}
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setAnalysis(null)}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={confirm}
                  disabled={busy || selected.size === 0}
                >
                  {busy ? "Adding…" : `Add ${selected.size} transaction${selected.size === 1 ? "" : "s"}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
