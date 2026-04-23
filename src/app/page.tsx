"use client";
import { useCallback, useEffect, useState } from "react";
import { AddTransactionForm } from "@/components/AddTransactionForm";
import { PositionsTable } from "@/components/PositionsTable";
import { TransactionsTable } from "@/components/TransactionsTable";
import { SummaryCards } from "@/components/SummaryCards";
import { AllocationChart } from "@/components/AllocationChart";
import { PerformanceChart } from "@/components/PerformanceChart";
import { CsvImport } from "@/components/CsvImport";
import { EditTransactionModal } from "@/components/EditTransactionModal";
import { PriceOverridesPanel } from "@/components/PriceOverridesPanel";
import type { PortfolioResponse } from "@/lib/types";
import type { Transaction } from "@/lib/transaction-types";

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF", "CNY", "INR", "BRL", "MXN", "SGD"];

export default function HomePage() {
  const [currency, setCurrency] = useState("USD");
  const [data, setData] = useState<PortfolioResponse | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`/api/portfolio?currency=${currency}`).then((r) =>
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
  }, [currency, refreshKey]);

  async function handleDeleteTx(id: string) {
    await fetch(`/api/transactions/${id}`, { method: "DELETE" });
    refresh();
  }

  const positions = data?.holdings ?? [];

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
          <button className="btn-ghost" onClick={refresh} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <CsvImport onImported={refresh} />
        </div>
      </header>

      {error && (
        <div className="card border-bad/40 bg-bad/10 text-bad text-sm">
          Error loading portfolio: {error}
        </div>
      )}

      <SummaryCards holdings={positions} currency={currency} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PerformanceChart currency={currency} refreshKey={refreshKey} />
        <AllocationChart holdings={positions} currency={currency} />
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Positions</h2>
          <span className="text-xs text-muted">Aggregated from transactions</span>
        </div>
        <PositionsTable positions={positions} currency={currency} />
      </section>

      <PriceOverridesPanel
        symbols={positions.map((p) => p.symbol)}
        onChanged={refresh}
      />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Transactions</h2>
          <span className="text-xs text-muted">
            {transactions.length} total · source of truth
          </span>
        </div>
        <AddTransactionForm onAdded={refresh} />
        <TransactionsTable
          transactions={transactions}
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
