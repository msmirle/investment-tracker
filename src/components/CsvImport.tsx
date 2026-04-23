"use client";
import { useRef, useState } from "react";

export function CsvImport({ onImported }: { onImported: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setStatus(null);
    try {
      const text = await file.text();
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "content-type": "text/csv" },
        body: text,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setStatus(
        `Imported ${data.importedCount} transactions` +
          (data.errors?.length ? ` (${data.errors.length} errors)` : ""),
      );
      onImported();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        className="btn-ghost"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        title="CSV columns: symbol, assetType, action, quantity, price, fees, currency, name, executedAt, account, orderType, notes"
      >
        {busy ? "Importing…" : "Import CSV"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        title="Choose CSV file"
        aria-label="Choose CSV file to import"
        onChange={onFile}
      />
      {status && <span className="text-xs text-muted">{status}</span>}
    </div>
  );
}
