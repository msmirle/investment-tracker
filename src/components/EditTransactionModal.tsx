"use client";
import { useEffect, useState } from "react";
import type { Transaction } from "@/lib/transaction-types";

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF", "CNY", "INR", "BRL", "MXN", "SGD"];
const ORDER_TYPES = ["MARKET", "LIMIT", "STOP", "STOP_LIMIT", "GTC"];

interface Props {
  transaction: Transaction | null;
  onClose: () => void;
  onSaved: () => void;
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EditTransactionModal({ transaction, onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    symbol: "",
    name: "",
    assetType: "STOCK",
    action: "BUY",
    quantity: "",
    price: "",
    fees: "",
    currency: "USD",
    account: "",
    orderType: "MARKET",
    executedAt: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!transaction) return;
    setForm({
      symbol: transaction.symbol,
      name: transaction.name || "",
      assetType: transaction.assetType,
      action: transaction.action,
      quantity: String(transaction.quantity),
      price: String(transaction.price),
      fees: String(transaction.fees || 0),
      currency: transaction.currency,
      account: transaction.account || "",
      orderType: transaction.orderType || "MARKET",
      executedAt: toLocalInput(transaction.executedAt),
      notes: transaction.notes || "",
    });
    setError(null);
  }, [transaction]);

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (transaction) window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [transaction, onClose]);

  if (!transaction) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!transaction) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/transactions/${transaction.id}`, {
        method: "PATCH",
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
          orderType: form.orderType || null,
          executedAt: new Date(form.executedAt).toISOString(),
          notes: form.notes || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed (${res.status})`);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        className="card w-full max-w-3xl space-y-4 my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Edit Transaction</h3>
          <button type="button" className="text-muted hover:text-slate-100 text-sm" onClick={onClose}>
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
              title="Symbol"
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
              <option value="CRYPTO">Crypto</option>
            </select>
          </div>
          <div>
            <label className="label">Name</label>
            <input
              className="input"
              title="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Quantity *</label>
            <input
              className="input"
              title="Quantity"
              type="number"
              step="any"
              min="0"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label">Fill Price *</label>
            <input
              className="input"
              title="Fill price"
              type="number"
              step="any"
              min="0"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label">Fees</label>
            <input
              className="input"
              title="Fees"
              type="number"
              step="any"
              min="0"
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
            <label className="label">Account</label>
            <input
              className="input"
              title="Account"
              value={form.account}
              onChange={(e) => setForm({ ...form, account: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <label className="label">Notes</label>
            <input
              className="input"
              title="Notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>

        {error && <div className="text-sm text-bad">{error}</div>}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={submitting}>
            {submitting ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
