"use client";
import { useCallback, useEffect, useState } from "react";
import { AddTransactionForm } from "@/components/AddTransactionForm";
import { PositionsTable } from "@/components/PositionsTable";
import { TransactionsTable } from "@/components/TransactionsTable";
import { SummaryCards } from "@/components/SummaryCards";
import { AllocationChart } from "@/components/AllocationChart";
import { PerformanceChart } from "@/components/PerformanceChart";
import { StatementImport } from "@/components/StatementImport";
import { EditTransactionModal } from "@/components/EditTransactionModal";
import { PriceOverridesPanel } from "@/components/PriceOverridesPanel";
import type { PortfolioResponse } from "@/lib/types";
import type { Transaction } from "@/lib/transaction-types";

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF", "CNY", "INR", "BRL", "MXN", "SGD"];

function formatAgo(d: Date): string {
  const s = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

export default function HomePage() {
  const [currency, setCurrency] = useState("CAD");
  const [selectedFirms, setSelectedFirms] = useState<string[]>([]);
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null);
  const [data, setData] = useState<PortfolioResponse | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [, setNowTick] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Auto-refresh every 60 seconds (matches server quote TTL).
  useEffect(() => {
    const id = setInterval(() => refresh(), 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  // Re-render once a second so the "Updated X ago" label stays fresh.
  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const firmQs = selectedFirms.map((f) => `&firm=${encodeURIComponent(f)}`).join("");
    Promise.all([
      fetch(`/api/portfolio?currency=${currency}${firmQs}`).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`portfolio HTTP ${r.status}`)),
      ),
      fetch(`/api/transactions`).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`transactions HTTP ${r.status}`)),
      ),
    ])
      .then(([portfolio, txs]: [PortfolioResponse, Transaction[]]) => {
        if (!cancelled) {
          setData(portfolio);
          setTransactions(txs);
          setLastUpdated(new Date());
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currency, selectedFirms, refreshKey]);

  async function handleDeleteTx(id: string) {
    await fetch(`/api/transactions/${id}`, { method: "DELETE" });
    refresh();
  }

  const allPositions = data?.holdings ?? [];
  const selectedPosition = selectedPositionId
    ? allPositions.find((h) => h.id === selectedPositionId) ?? null
    : null;
  const visiblePositions = selectedPosition ? [selectedPosition] : allPositions;
  const firms = Array.from(new Set(transactions.map((t) => t.firm).filter(Boolean) as string[])).sort();
  const visibleTransactions = transactions.filter((t) => {
    if (selectedFirms.length > 0 && (!t.firm || !selectedFirms.includes(t.firm))) return false;
    if (selectedPosition) {
      if (t.symbol !== selectedPosition.symbol) return false;
      if ((t.firm ?? null) !== (selectedPosition.firm ?? null)) return false;
      if ((t.accountNumber ?? null) !== (selectedPosition.accountNumber ?? null)) return false;
    }
    return true;
  });

  const toggleFirm = (f: string) =>
    setSelectedFirms((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-indigo-400 to-cyan-300 text-transparent bg-clip-text">
              Portfolio Tracker
            </span>
          </h1>
          <p className="text-muted text-sm mt-1">
            Stocks · ETFs · Crypto · Live market values
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs uppercase tracking-wider text-muted">Firms</label>
            <button
              type="button"
              onClick={() => setSelectedFirms([])}
              className={`px-2.5 py-1 rounded-full text-xs border transition ${
                selectedFirms.length === 0
                  ? "bg-accent/20 border-accent/40 text-accent"
                  : "bg-panel2 border-border text-muted hover:text-fg"
              }`}
              title="Show all firms"
            >
              All
            </button>
            {firms.map((f) => {
              const active = selectedFirms.includes(f);
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => toggleFirm(f)}
                  className={`px-2.5 py-1 rounded-full text-xs border transition ${
                    active
                      ? "bg-accent/20 border-accent/40 text-accent"
                      : "bg-panel2 border-border text-muted hover:text-fg"
                  }`}
                >
                  {f}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs uppercase tracking-wider text-muted">Display in</label>
            <select
              className="select !w-auto"
              title="Display currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <button className="btn-ghost" onClick={refresh} disabled={loading} title={lastUpdated ? `Last updated ${lastUpdated.toLocaleTimeString()}` : undefined}>
            {loading ? "Refreshing…" : lastUpdated ? `Refresh · ${formatAgo(lastUpdated)}` : "Refresh"}
          </button>
          <StatementImport onImported={refresh} />
        </div>
      </header>

      {error && (
        <div className="card border-bad/40 bg-bad/10 text-bad text-sm">
          Error loading portfolio: {error}
        </div>
      )}

      <SummaryCards holdings={visiblePositions} currency={currency} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PerformanceChart
          currency={currency}
          firms={selectedFirms}
          symbol={selectedPosition?.symbol}
          accountNumber={selectedPosition?.accountNumber ?? undefined}
          refreshKey={refreshKey}
        />
        <AllocationChart holdings={visiblePositions} currency={currency} />
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Positions</h2>
          <div className="flex items-center gap-3">
            {selectedPosition && (
              <button className="btn-ghost text-xs" onClick={() => setSelectedPositionId(null)}>
                Clear selection ({selectedPosition.symbol})
              </button>
            )}
            <span className="text-xs text-muted">Click a row to filter visuals</span>
          </div>
        </div>
        <PositionsTable
          positions={allPositions}
          currency={currency}
          selectedId={selectedPositionId}
          onSelect={setSelectedPositionId}
        />
      </section>

      <PriceOverridesPanel
        symbols={allPositions.map((p) => p.symbol)}
        onChanged={refresh}
      />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Transactions</h2>
          <span className="text-xs text-muted">
            {visibleTransactions.length} shown · {transactions.length} total
          </span>
        </div>
        <AddTransactionForm onAdded={refresh} />
        <TransactionsTable
          transactions={visibleTransactions}
          onEdit={setEditing}
          onDelete={handleDeleteTx}
        />
      </section>

      <EditTransactionModal
        transaction={editing}
        onClose={() => setEditing(null)}
        onSaved={refresh}
      />

      <footer className="text-center text-xs text-muted pt-4 pb-8">
        Prices via Yahoo Finance &amp; CoinGecko · For personal tracking only
      </footer>
    </main>
  );
}
