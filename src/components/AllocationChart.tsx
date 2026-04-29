"use client";
import { useMemo, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import type { EvaluatedHolding } from "@/lib/types";
import { fmtCurrency } from "@/lib/format";

const PALETTE = [
  "#6366f1", "#22d3ee", "#f59e0b", "#10b981", "#ef4444", "#a855f7",
  "#ec4899", "#14b8a6", "#eab308", "#3b82f6", "#84cc16", "#f97316",
];

type GroupBy = "symbol" | "type" | "firm" | "account";

const GROUPS: Array<{ key: GroupBy; label: string }> = [
  { key: "symbol", label: "Symbol" },
  { key: "type", label: "Type" },
  { key: "firm", label: "Firm" },
  { key: "account", label: "Account" },
];

function typeLabel(t: EvaluatedHolding["assetType"]): string {
  if (t === "MUTUAL_FUND") return "MF";
  if (t === "PRIVATE_EQUITY") return "PE";
  return t;
}

export function AllocationChart({ holdings, currency }: { holdings: EvaluatedHolding[]; currency: string }) {
  const [groupBy, setGroupBy] = useState<GroupBy>("symbol");

  const data = useMemo(() => {
    const totals = new Map<string, number>();
    for (const h of holdings) {
      const mv = h.marketValue ?? 0;
      if (mv <= 0) continue;
      let key: string;
      if (groupBy === "symbol") {
        key = h.symbol;
      } else if (groupBy === "type") {
        key = typeLabel(h.assetType);
      } else if (groupBy === "firm") {
        key = h.firm || "Unassigned";
      } else {
        // account: combine firm + account so identical account numbers
        // at different firms don't collide.
        const acct = h.accountNumber?.trim();
        if (!acct) {
          key = "Unassigned";
        } else {
          key = h.firm ? `${h.firm} · ${acct}` : acct;
        }
      }
      totals.set(key, (totals.get(key) ?? 0) + mv);
    }
    return Array.from(totals.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [holdings, groupBy]);

  return (
    <div className="card h-[380px] flex flex-col">
      <div className="flex items-center justify-between mb-2 gap-3">
        <h3 className="text-base font-semibold">Allocation</h3>
        <div className="flex gap-1 bg-panel2 p-1 rounded-lg border border-border">
          {GROUPS.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => setGroupBy(g.key)}
              className={`px-2.5 py-1 rounded-md text-xs transition ${
                groupBy === g.key
                  ? "bg-accent/20 text-accent"
                  : "text-muted hover:text-fg"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>
      {data.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted text-sm">No data yet</div>
      ) : (
        <div className="flex-1 chart-sensitive">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius="55%"
                outerRadius="85%"
                paddingAngle={2}
                stroke="none"
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: "#141a2f", border: "1px solid #2a335a", borderRadius: 12, color: "#e2e8f0" }}
                itemStyle={{ color: "#e2e8f0" }}
                labelStyle={{ color: "#f1f5f9" }}
                formatter={(v: number) => fmtCurrency(v, currency)}
              />
              <Legend
                iconType="circle"
                wrapperStyle={{ fontSize: 12, color: "#e2e8f0" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
