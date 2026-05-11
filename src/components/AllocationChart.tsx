"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import type { EvaluatedHolding } from "@/lib/types";
import { fmtCurrency } from "@/lib/format";

const PALETTE = [
  "#6366f1", "#22d3ee", "#f59e0b", "#10b981", "#ef4444", "#a855f7",
  "#ec4899", "#14b8a6", "#eab308", "#3b82f6", "#84cc16", "#f97316",
];

export type GroupBy = "symbol" | "type" | "firm" | "account" | "vehicle";

const GROUPS: Array<{ key: GroupBy; label: string }> = [
  { key: "symbol", label: "Symbol" },
  { key: "type", label: "Type" },
  { key: "firm", label: "Firm" },
  { key: "account", label: "Account" },
  { key: "vehicle", label: "Vehicle" },
];

// Registered vehicle / account types we want to surface in the Vehicle view.
// Matched case-insensitively against the accountNumber (and optionally the
// account label) since some imports prefix the account number with the
// vehicle (e.g. "RRSP - 12345") while others store it elsewhere.
const VEHICLE_TYPES = ["RRSP", "TFSA", "RESP", "LIRA", "SRSP", "RRIF", "RIF", "Margin", "Cash"] as const;
const VEHICLE_RE = new RegExp(`\\b(${VEHICLE_TYPES.join("|")})\\b`, "i");

export function vehicleOf(accountNumber?: string | null, account?: string | null): string {
  const probe = `${accountNumber ?? ""} ${account ?? ""}`;
  const m = probe.match(VEHICLE_RE);
  if (!m) return "Other";
  const found = m[1].toUpperCase();
  if (found === "RIF") return "RRIF";
  if (found === "MARGIN") return "Margin";
  if (found === "CASH") return "Cash";
  return found;
}

function typeLabel(t: EvaluatedHolding["assetType"]): string {
  if (t === "MUTUAL_FUND") return "MF";
  if (t === "PRIVATE_EQUITY") return "PE";
  return t;
}

export function holdingGroupKey(h: EvaluatedHolding, groupBy: GroupBy): string {
  if (groupBy === "symbol") return h.symbol;
  if (groupBy === "type") return typeLabel(h.assetType);
  if (groupBy === "firm") return h.firm || "Unassigned";
  if (groupBy === "vehicle") return vehicleOf(h.accountNumber);
  // account: combine firm + account so identical account numbers
  // at different firms don't collide.
  const acct = h.accountNumber?.trim();
  if (!acct) return "Unassigned";
  return h.firm ? `${h.firm} · ${acct}` : acct;
}

export interface SliceSelection {
  groupBy: GroupBy;
  key: string;
}

export function AllocationChart({
  holdings,
  currency,
  selectedSlice,
  onSliceClick,
}: {
  holdings: EvaluatedHolding[];
  currency: string;
  selectedSlice?: SliceSelection | null;
  onSliceClick?: (sel: SliceSelection | null) => void;
}) {
  const [groupBy, setGroupBy] = useState<GroupBy>(
    selectedSlice?.groupBy ?? "symbol",
  );

  const data = useMemo(() => {
    const totals = new Map<string, number>();
    for (const h of holdings) {
      const mv = h.marketValue ?? 0;
      if (mv <= 0) continue;
      const key = holdingGroupKey(h, groupBy);
      totals.set(key, (totals.get(key) ?? 0) + mv);
    }
    return Array.from(totals.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [holdings, groupBy]);

  const activeKey =
    selectedSlice && selectedSlice.groupBy === groupBy ? selectedSlice.key : null;

  // Controlled tooltip visibility so we can dismiss the "stuck" tooltip on
  // touch devices (no mouseleave fires after a tap).
  const [tooltipActive, setTooltipActive] = useState<boolean | undefined>(undefined);
  // For touch devices, drive the tooltip content explicitly so tapping a new
  // slice updates the label (recharts won't fire mouseenter on touch).
  const [touchTip, setTouchTip] = useState<
    { name: string; value: number; color: string } | null
  >(null);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const lastTouchRef = useRef<number>(0);

  // Reset the pinned touch tooltip when the group/data changes.
  useEffect(() => {
    setTouchTip(null);
  }, [groupBy]);

  useEffect(() => {
    const el = chartRef.current;
    function onDocTouch(e: TouchEvent) {
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) {
        lastTouchRef.current = Date.now();
        return;
      }
      setTooltipActive(false);
      setTouchTip(null);
    }
    document.addEventListener("touchstart", onDocTouch, { passive: true });
    return () => document.removeEventListener("touchstart", onDocTouch);
  }, []);

  function handleSliceClick(name: string, index: number) {
    const isTouch = Date.now() - lastTouchRef.current < 600;
    // Hide the tooltip after a tap so it doesn't remain stuck on mobile.
    setTooltipActive(false);
    // Re-enable hover-driven tooltip on the next interaction.
    setTimeout(() => setTooltipActive(undefined), 0);

    if (isTouch && index >= 0 && index < data.length) {
      const d = data[index];
      // Toggle off if tapping the same slice that's already pinned.
      if (touchTip && touchTip.name === name) {
        setTouchTip(null);
      } else {
        setTouchTip({
          name: d.name,
          value: d.value,
          color: PALETTE[index % PALETTE.length],
        });
      }
    } else {
      setTouchTip(null);
    }

    if (!onSliceClick) return;
    if (activeKey === name) {
      onSliceClick(null);
    } else {
      onSliceClick({ groupBy, key: name });
    }
  }

  return (
    <div className="card h-[380px] flex flex-col">
      <div className="flex items-center justify-between mb-2 gap-3">
        <h3 className="text-base font-semibold">Allocation</h3>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {activeKey && (
            <button
              type="button"
              className="px-2 py-1 rounded-md text-xs text-muted hover:text-fg border border-border bg-panel2"
              onClick={() => onSliceClick?.(null)}
              title="Clear allocation filter"
            >
              ✕ {activeKey}
            </button>
          )}
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
      </div>
      {data.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted text-sm">No data yet</div>
      ) : (
        <div className="flex-1 chart-sensitive" ref={chartRef}>
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
                onClick={(d: { name?: string }, i: number) => {
                  if (d?.name) handleSliceClick(d.name, i);
                }}
                style={onSliceClick ? { cursor: "pointer" } : undefined}
              >
                {data.map((d, i) => {
                  const dim = activeKey !== null && activeKey !== d.name;
                  return (
                    <Cell
                      key={i}
                      fill={PALETTE[i % PALETTE.length]}
                      fillOpacity={dim ? 0.25 : 1}
                      stroke={activeKey === d.name ? "rgb(var(--color-fg))" : "none"}
                      strokeWidth={activeKey === d.name ? 2 : 0}
                    />
                  );
                })}
              </Pie>
              <Tooltip
                {...(touchTip
                  ? {
                      active: true,
                      payload: [
                        {
                          name: touchTip.name,
                          value: touchTip.value,
                          color: touchTip.color,
                          dataKey: "value",
                          payload: { name: touchTip.name, value: touchTip.value },
                        },
                      ],
                    }
                  : tooltipActive === false
                    ? { active: false }
                    : {})}
                contentStyle={{ background: "rgb(var(--color-panel))", border: "1px solid rgb(var(--color-border))", borderRadius: 12, color: "rgb(var(--color-fg))" }}
                itemStyle={{ color: "rgb(var(--color-fg))" }}
                labelStyle={{ color: "rgb(var(--color-fg))" }}
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
