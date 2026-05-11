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

  // Detect coarse pointers (touch). On touch, recharts' tooltip stays pinned
  // after a tap (no mouseleave is ever fired) and the next tap on a
  // different slice often doesn't fire onClick because recharts thinks the
  // first slice is still active. We work around it with a document-level
  // capture-phase touchstart listener that:
  //   1. geometrically picks the slice from the touch coordinates, and
  //   2. dispatches synthetic mouse/pointer-leave events at the SVG to
  //      reset recharts' internal active state on every tap inside the chart
  //      (this is the same reset that "tap on a blank area" achieves
  //      manually).
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(hover: none), (pointer: coarse)");
    const update = () => setIsTouchDevice(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  function handleSliceClick(name: string) {
    if (!onSliceClick) return;
    if (activeKey === name) {
      onSliceClick(null);
    } else {
      onSliceClick({ groupBy, key: name });
    }
  }

  const handleSliceClickRef = useRef(handleSliceClick);
  useEffect(() => {
    handleSliceClickRef.current = handleSliceClick;
  });

  useEffect(() => {
    if (!isTouchDevice) return;

    function resetRechartsActiveState() {
      const host = chartRef.current;
      if (!host) return;
      const svg = host.querySelector(
        "svg.recharts-surface",
      ) as SVGSVGElement | null;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const init: MouseEventInit = {
        clientX: rect.left - 1000,
        clientY: rect.top - 1000,
        bubbles: true,
        cancelable: true,
      };
      try {
        svg.dispatchEvent(new MouseEvent("mousemove", init));
        svg.dispatchEvent(new MouseEvent("mouseout", init));
        svg.dispatchEvent(new MouseEvent("mouseleave", init));
        if (typeof PointerEvent !== "undefined") {
          svg.dispatchEvent(new PointerEvent("pointermove", init));
          svg.dispatchEvent(new PointerEvent("pointerout", init));
          svg.dispatchEvent(new PointerEvent("pointerleave", init));
        }
      } catch {
        /* ignore */
      }
    }

    function pickSliceFromPoint(
      clientX: number,
      clientY: number,
    ): { idx: number; insideChart: boolean } {
      const host = chartRef.current;
      if (!host) return { idx: -1, insideChart: false };
      const hostRect = host.getBoundingClientRect();
      const insideChart =
        clientX >= hostRect.left &&
        clientX <= hostRect.right &&
        clientY >= hostRect.top &&
        clientY <= hostRect.bottom;
      if (!insideChart) return { idx: -1, insideChart };

      const svg = host.querySelector(
        "svg.recharts-surface",
      ) as SVGSVGElement | null;
      if (!svg) return { idx: -1, insideChart };
      const rect = svg.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const radius = Math.min(rect.width, rect.height) / 2;
      const inner = radius * 0.55;
      const outer = radius * 0.85;
      if (dist < inner * 0.7 || dist > outer * 1.2)
        return { idx: -1, insideChart };

      const items = dataRef.current;
      const total = items.reduce((s, d) => s + d.value, 0);
      if (total <= 0) return { idx: -1, insideChart };

      // Recharts Pie default: starts at 12 o'clock, sweeps clockwise.
      const angle = Math.atan2(-dy, dx) * (180 / Math.PI); // 0=right, 90=up
      let sweep = 90 - angle; // degrees clockwise from 12 o'clock
      sweep = ((sweep % 360) + 360) % 360;
      let cum = 0;
      for (let i = 0; i < items.length; i++) {
        const next = cum + (items[i].value / total) * 360;
        if (sweep >= cum && sweep < next) return { idx: i, insideChart };
        cum = next;
      }
      return { idx: -1, insideChart };
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const { idx, insideChart } = pickSliceFromPoint(t.clientX, t.clientY);
      if (!insideChart) return;
      // Always clear recharts' internal active state on any tap inside the
      // chart — this is what "tap a blank area" was doing manually.
      resetRechartsActiveState();
      if (idx < 0) return;
      const d = dataRef.current[idx];
      if (!d) return;
      handleSliceClickRef.current(d.name);
      // After the React state update, reset again on the next frame in case
      // recharts re-pinned itself in response to its own touch handling.
      requestAnimationFrame(resetRechartsActiveState);
    }

    document.addEventListener("touchstart", onTouchStart, {
      passive: true,
      capture: true,
    });
    return () =>
      document.removeEventListener("touchstart", onTouchStart, true);
  }, [isTouchDevice]);

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
              {(() => {
                const sel = data.find((d) => d.name === activeKey);
                return sel ? ` · ${fmtCurrency(sel.value, currency)}` : "";
              })()}
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
                onClick={(d: { name?: string }) => {
                  if (d?.name) handleSliceClick(d.name);
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
              {!isTouchDevice && (
                <Tooltip
                  wrapperStyle={{ pointerEvents: "none" }}
                  contentStyle={{ background: "rgb(var(--color-panel))", border: "1px solid rgb(var(--color-border))", borderRadius: 12, color: "rgb(var(--color-fg))" }}
                  itemStyle={{ color: "rgb(var(--color-fg))" }}
                  labelStyle={{ color: "rgb(var(--color-fg))" }}
                  formatter={(v: number) => fmtCurrency(v, currency)}
                />
              )}
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
