"use client";
import { useEffect, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { fmtCurrency } from "@/lib/format";
import type { HistoryResponse } from "@/lib/types";

const RANGES: Array<{ label: string; days: number }> = [
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1Y", days: 365 },
  { label: "2Y", days: 730 },
  { label: "5Y", days: 1825 },
];

export function PerformanceChart({ currency, firms, symbol, accountNumber, refreshKey }: { currency: string; firms?: string[]; symbol?: string; accountNumber?: string; refreshKey: number }) {
  const [days, setDays] = useState(180);
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ currency, days: String(days) });
    if (firms) for (const f of firms) params.append("firm", f);
    if (symbol) params.set("symbol", symbol);
    if (accountNumber) params.set("accountNumber", accountNumber);
    fetch(`/api/history?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: HistoryResponse) => {
        if (!cancelled) setData(d);
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
  }, [currency, days, firms, symbol, accountNumber, refreshKey]);

  const series = data?.series ?? [];

  return (
    <div className="card h-[380px] flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-base font-semibold">Portfolio Performance</h3>
          <div className="text-xs text-muted">Estimated historical value</div>
        </div>
        <div className="flex gap-1 bg-panel2 p-1 rounded-lg border border-border">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={`px-2.5 py-1 text-xs rounded-md transition ${
                days === r.days ? "bg-accent text-white" : "text-muted hover:text-slate-100"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="flex-1 flex items-center justify-center text-muted text-sm">Loading…</div>}
      {error && !loading && <div className="flex-1 flex items-center justify-center text-bad text-sm">{error}</div>}
      {!loading && !error && series.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-muted text-sm">No history available</div>
      )}
      {!loading && !error && series.length > 0 && (
        <div className="flex-1 chart-sensitive">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="valueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#2a335a" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                axisLine={{ stroke: "#2a335a" }}
                tickLine={false}
                minTickGap={32}
              />
              <YAxis
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                axisLine={{ stroke: "#2a335a" }}
                tickLine={false}
                tickFormatter={(v) => fmtCurrency(v, currency).replace(/\.00$/, "")}
                width={80}
              />
              <Tooltip
                contentStyle={{ background: "#141a2f", border: "1px solid #2a335a", borderRadius: 12 }}
                labelStyle={{ color: "#94a3b8" }}
                formatter={(v: number) => [fmtCurrency(v, currency), "Value"]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#818cf8"
                strokeWidth={2}
                fill="url(#valueGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
