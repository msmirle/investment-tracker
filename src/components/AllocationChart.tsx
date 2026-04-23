"use client";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import type { EvaluatedHolding } from "@/lib/types";
import { fmtCurrency } from "@/lib/format";

const PALETTE = [
  "#6366f1", "#22d3ee", "#f59e0b", "#10b981", "#ef4444", "#a855f7",
  "#ec4899", "#14b8a6", "#eab308", "#3b82f6", "#84cc16", "#f97316",
];

export function AllocationChart({ holdings, currency }: { holdings: EvaluatedHolding[]; currency: string }) {
  const data = holdings
    .filter((h) => (h.marketValue ?? 0) > 0)
    .map((h) => ({ name: h.symbol, value: h.marketValue as number }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="card h-[380px] flex flex-col">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-base font-semibold">Allocation</h3>
        <span className="text-xs text-muted">By market value</span>
      </div>
      {data.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted text-sm">No data yet</div>
      ) : (
        <div className="flex-1">
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
                contentStyle={{ background: "#141a2f", border: "1px solid #2a335a", borderRadius: 12 }}
                formatter={(v: number) => fmtCurrency(v, currency)}
              />
              <Legend
                iconType="circle"
                wrapperStyle={{ fontSize: 12, color: "#94a3b8" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
