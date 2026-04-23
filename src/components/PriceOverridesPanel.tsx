"use client";
import { useEffect, useState } from "react";

interface SymbolMetaRow {
  symbol: string;
  quoteSymbol: string | null;
  manualPrice: number | null;
  manualPriceCurrency: string | null;
  manualPriceAsOf: string | null;
  notes: string | null;
  updatedAt: string;
}

interface Props {
  // Symbols currently appearing in the portfolio — suggested for quick entry.
  symbols: string[];
  // Called after any change so portfolio can refetch.
  onChanged: () => void;
}

const emptyForm = {
  symbol: "",
  quoteSymbol: "",
  manualPrice: "",
  manualPriceCurrency: "",
  manualPriceAsOf: "",
  notes: "",
};

export function PriceOverridesPanel({ symbols, onChanged }: Props) {
  const [rows, setRows] = useState<SymbolMetaRow[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function load() {
    const res = await fetch("/api/symbol-meta");
    if (res.ok) setRows(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.symbol.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/symbol-meta", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          symbol: form.symbol,
          quoteSymbol: form.quoteSymbol || null,
          manualPrice: form.manualPrice === "" ? null : Number(form.manualPrice),
          manualPriceCurrency: form.manualPriceCurrency || null,
          manualPriceAsOf: form.manualPriceAsOf || null,
          notes: form.notes || null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setForm(emptyForm);
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function edit(row: SymbolMetaRow) {
    setForm({
      symbol: row.symbol,
      quoteSymbol: row.quoteSymbol ?? "",
      manualPrice: row.manualPrice != null ? String(row.manualPrice) : "",
      manualPriceCurrency: row.manualPriceCurrency ?? "",
      manualPriceAsOf: row.manualPriceAsOf ? row.manualPriceAsOf.slice(0, 10) : "",
      notes: row.notes ?? "",
    });
    setOpen(true);
  }

  async function remove(symbol: string) {
    if (!confirm(`Remove price override for ${symbol}?`)) return;
    await fetch(`/api/symbol-meta?symbol=${encodeURIComponent(symbol)}`, { method: "DELETE" });
    await load();
    onChanged();
  }

  const known = new Set(rows.map((r) => r.symbol.toUpperCase()));
  const missing = symbols.filter((s) => !known.has(s.toUpperCase()));

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Price Overrides</h2>
        <button className="btn-ghost text-xs" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide" : `Manage (${rows.length})`}
        </button>
      </div>
      {open && (
        <div className="card space-y-4">
          <p className="text-xs text-muted">
            Canadian mutual fund codes (e.g. <code>TDB310</code>, <code>MFC307</code>) are
            looked up automatically via Fundata / Globe &amp; Mail. Use this panel only when
            that fails: set a <b>Yahoo alias</b> (e.g. <code>0P000074ST.TO</code>) to fetch
            from Yahoo instead, or a <b>manual price</b> for delisted/closed funds. Manual
            price always wins.
          </p>
          <form onSubmit={save} className="grid grid-cols-1 md:grid-cols-6 gap-2 text-sm">
            <input
              className="input md:col-span-1"
              placeholder="Symbol"
              title="Portfolio symbol (e.g. AGF945)"
              list="override-symbol-suggest"
              value={form.symbol}
              onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })}
              required
            />
            <datalist id="override-symbol-suggest">
              {missing.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <input
              className="input md:col-span-2"
              placeholder="Yahoo alias (optional)"
              title="Yahoo ticker to fetch instead, e.g. 0P000074ST.TO"
              value={form.quoteSymbol}
              onChange={(e) => setForm({ ...form, quoteSymbol: e.target.value })}
            />
            <input
              className="input md:col-span-1"
              placeholder="Manual price"
              title="Manual NAV/price (takes priority)"
              type="number"
              step="0.0001"
              value={form.manualPrice}
              onChange={(e) => setForm({ ...form, manualPrice: e.target.value })}
            />
            <input
              className="input md:col-span-1"
              placeholder="CCY"
              title="Manual price currency (e.g. CAD)"
              value={form.manualPriceCurrency}
              onChange={(e) =>
                setForm({ ...form, manualPriceCurrency: e.target.value.toUpperCase() })
              }
            />
            <input
              className="input md:col-span-1"
              type="date"
              title="As-of date for manual price"
              value={form.manualPriceAsOf}
              onChange={(e) => setForm({ ...form, manualPriceAsOf: e.target.value })}
            />
            <input
              className="input md:col-span-5"
              placeholder="Notes (optional)"
              title="Free-form notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
            <button className="btn md:col-span-1" disabled={busy} type="submit">
              {busy ? "Saving…" : "Save"}
            </button>
          </form>
          {error && <div className="text-bad text-xs">{error}</div>}
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-muted">
                    <th className="py-2 pr-3">Symbol</th>
                    <th className="py-2 pr-3">Yahoo alias</th>
                    <th className="py-2 pr-3 text-right">Manual price</th>
                    <th className="py-2 pr-3">As of</th>
                    <th className="py-2 pr-3">Notes</th>
                    <th className="py-2 pr-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.symbol} className="border-t border-white/5">
                      <td className="py-2 pr-3 font-mono">{r.symbol}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{r.quoteSymbol ?? "—"}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {r.manualPrice != null
                          ? `${r.manualPrice} ${r.manualPriceCurrency ?? ""}`.trim()
                          : "—"}
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        {r.manualPriceAsOf ? r.manualPriceAsOf.slice(0, 10) : "—"}
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted">{r.notes ?? ""}</td>
                      <td className="py-2 pr-3 text-right space-x-2">
                        <button className="btn-ghost text-xs" onClick={() => edit(r)}>
                          Edit
                        </button>
                        <button
                          className="btn-ghost text-xs text-bad"
                          onClick={() => remove(r.symbol)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
