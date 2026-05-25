"use client";
import { useEffect, useRef, useState } from "react";
import type { Transaction } from "@/lib/transaction-types";

interface Props {
  onAdded: () => void;
  prefill?: Transaction | null;
  onPrefillConsumed?: () => void;
}

const CURRENCIES = ["USD", "CAD"];
const ORDER_TYPES = ["MARKET", "LIMIT", "STOP", "STOP_LIMIT", "GTC"];

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AddTransactionForm({ onAdded, prefill, onPrefillConsumed }: Props) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initial = {
    symbol: "",
    name: "",
    assetType: "STOCK",
    action: "BUY",
    quantity: "",
    price: "",
    fees: "",
    currency: "USD",
    account: "",
    firm: "",
    accountNumber: "",
    orderType: "MARKET",
    executedAt: "",
    notes: "",
  };
  const [form, setForm] = useState(initial);
  // Track the id of the last prefill we applied so the effect is idempotent
  // (avoids re-populating mid-edit if the parent re-renders).
  const appliedPrefillId = useRef<string | null>(null);

  // When a transaction is handed in to duplicate, populate the form and open it.
  useEffect(() => {
    if (!prefill) {
      appliedPrefillId.current = null;
      return;
    }
    if (appliedPrefillId.current === prefill.id) return;
    appliedPrefillId.current = prefill.id;
    setForm({
      symbol: prefill.symbol,
      name: prefill.name || "",
      assetType: prefill.assetType,
      action: prefill.action,
      quantity: String(prefill.quantity),
      price: String(prefill.price),
      fees: prefill.fees ? String(prefill.fees) : "",
      currency: prefill.currency,
      account: prefill.account || "",
      firm: prefill.firm || "",
      accountNumber: prefill.accountNumber || "",
      orderType: prefill.orderType || "MARKET",
      executedAt: toLocalInput(prefill.executedAt),
      notes: prefill.notes || "",
    });
    setError(null);
    setOpen(true);
  }, [prefill]);

  function closeAndReset() {
    setForm(initial);
    setOpen(false);
    appliedPrefillId.current = null;
    onPrefillConsumed?.();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          symbol: form.symbol.trim(),
          name: form.name || null,
          assetType: form.assetType,
          action: form.action,
          quantity: parseFloat(form.quantity),
          price: parseFloat(form.price),
          fees: form.fees ? parseFloat(form.fees) : 0,
          currency: form.currency,
          account: form.account || null,
          firm: form.firm || null,
          accountNumber: form.accountNumber || null,
          orderType: form.orderType || null,
          executedAt: new Date(form.executedAt).toISOString(),
          notes: form.notes || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed (${res.status})`);
      }
      closeAndReset();
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        <span className="text-lg leading-none">+</span> Add Transaction
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Add Transaction</h3>
        <button type="button" className="text-muted hover:text-fg text-sm" onClick={closeAndReset}>
          Close
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="label">Action *</label>
          <select
            className="select"
            title="Action"
            value={form.action}
            onChange={(e) => setForm({ ...form, action: e.target.value })}
          >
            <option value="BUY">Buy</option>
            <option value="SELL">Sell</option>
          </select>
        </div>
        <div>
          <label className="label">Symbol *</label>
          <input
            className="input"
            placeholder="AAPL, VTI, BTC"
            value={form.symbol}
            onChange={(e) => setForm({ ...form, symbol: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="label">Type *</label>
          <select
            className="select"
            title="Asset type"
            value={form.assetType}
            onChange={(e) => setForm({ ...form, assetType: e.target.value })}
          >
            <option value="STOCK">Stock</option>
            <option value="ETF">ETF</option>
            <option value="MUTUAL_FUND">Mutual Fund</option>
            <option value="CRYPTO">Crypto</option>
            <option value="PRIVATE_EQUITY">Private Equity</option>
          </select>
        </div>
        <div>
          <label className="label">Name (optional)</label>
          <input
            className="input"
            placeholder="Apple Inc."
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Quantity *</label>
          <input
            className="input"
            type="number"
            step="any"
            min="0"
            placeholder="10"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="label">Fill Price *</label>
          <input
            className="input"
            type="number"
            step="any"
            min="0"
            placeholder="150.00"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="label">Fees</label>
          <input
            className="input"
            type="number"
            step="any"
            min="0"
            placeholder="0.00"
            value={form.fees}
            onChange={(e) => setForm({ ...form, fees: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Currency</label>
          <select
            className="select"
            title="Currency"
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value })}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Order Type</label>
          <select
            className="select"
            title="Order type"
            value={form.orderType}
            onChange={(e) => setForm({ ...form, orderType: e.target.value })}
          >
            {ORDER_TYPES.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Time Placed *</label>
          <input
            className="input"
            type="datetime-local"
            title="Executed at"
            value={form.executedAt}
            onChange={(e) => setForm({ ...form, executedAt: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="label">Firm</label>
          <input
            className="input"
            placeholder="Questrade, Investia - Michael"
            list="firm-suggestions"
            value={form.firm}
            onChange={(e) => setForm({ ...form, firm: e.target.value })}
          />
          <datalist id="firm-suggestions">
            <option value="Questrade" />
            <option value="Investia - Michael" />
          </datalist>
        </div>
        <div>
          <label className="label">Account #</label>
          <input
            className="input"
            placeholder="52033641"
            value={form.accountNumber}
            onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Account</label>
          <input
            className="input"
            placeholder="RSP - 12345"
            value={form.account}
            onChange={(e) => setForm({ ...form, account: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <label className="label">Notes</label>
          <input
            className="input"
            title="Notes"
            placeholder="Optional"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
      </div>

      {error && <div className="text-sm text-bad">{error}</div>}

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={closeAndReset}>
          Cancel
        </button>
        <button type="submit" className="btn" disabled={submitting}>
          {submitting ? "Saving…" : "Save Transaction"}
        </button>
      </div>
    </form>
  );
}
