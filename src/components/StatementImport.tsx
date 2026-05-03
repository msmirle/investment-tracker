"use client";
import { useEffect, useRef, useState } from "react";
import { fmtCurrency, fmtNumber } from "@/lib/format";
import { renderMarkdown } from "@/lib/markdown";

interface ProposedTx {
  symbol: string;
  name?: string | null;
  assetType: "STOCK" | "ETF" | "CRYPTO" | "MUTUAL_FUND" | "PRIVATE_EQUITY";
  action: "BUY" | "SELL" | "DIST";
  quantity: number;
  price: number;
  fees?: number | null;
  currency: string;
  firm?: string | null;
  accountNumber?: string | null;
  executedAt: string;
  notes?: string | null;
}

interface PositionChange {
  key: string;
  symbol: string;
  firm: string | null;
  accountNumber: string | null;
  currency: string;
  beforeQty: number;
  afterQty: number;
  beforeBook: number;
  afterBook: number;
  beforeRealized: number;
  afterRealized: number;
}

interface AnalysisResult {
  statementSummary: string;
  newTransactions: ProposedTx[];
  duplicateTransactions: ProposedTx[];
  positionChanges: PositionChange[];
  analysisId: string;
  assistantReply?: string;
}

interface ChatMsg {
  role: "user" | "assistant";
  text: string;
}

// Stable identity for a proposed transaction so we can preserve checkbox
// state across chat-driven refreshes.
function txKey(t: ProposedTx): string {
  return [
    t.executedAt.slice(0, 10),
    t.symbol,
    t.action,
    t.quantity,
    t.price,
    t.firm ?? "",
    t.accountNumber ?? "",
  ].join("|");
}

export function StatementImport({ onImported }: { onImported: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Phase 1 state — file picked, awaiting Analyze.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [instructions, setInstructions] = useState("");

  // Phase 2 state — analysis returned, awaiting confirm/refine.
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  // Chat state.
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Shared state.
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>("");

  // Auto-scroll chat thread when it grows.
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, chatBusy]);

  function reset() {
    setPendingFile(null);
    setInstructions("");
    setAnalysis(null);
    setSelectedKeys(new Set());
    setMessages([]);
    setChatInput("");
    setChatBusy(false);
    setBusy(false);
    setStatus(null);
    setFilename("");
    if (inputRef.current) inputRef.current.value = "";
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setFilename(file.name);
    setInstructions("");
    setStatus(null);
  }

  async function runAnalyze() {
    if (!pendingFile) return;
    setBusy(true);
    setStatus("Analyzing statement with AI…");
    setAnalysis(null);
    try {
      const fd = new FormData();
      fd.append("file", pendingFile, pendingFile.name);
      if (instructions.trim()) fd.append("instructions", instructions.trim());
      const res = await fetch("/api/analyze-statement", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      const result = data as AnalysisResult;
      setAnalysis(result);
      setSelectedKeys(new Set(result.newTransactions.map(txKey)));
      setMessages(
        result.assistantReply
          ? [{ role: "assistant", text: result.assistantReply }]
          : [],
      );
      // We're done with the upload buffer now; free it.
      setPendingFile(null);
      setStatus(null);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function sendChat() {
    if (!analysis) return;
    const message = chatInput.trim();
    if (!message || chatBusy) return;
    setChatInput("");
    setMessages((m) => [...m, { role: "user", text: message }]);
    setChatBusy(true);
    try {
      const res = await fetch("/api/analyze-statement/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ analysisId: analysis.analysisId, message }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data?.error || "Chat failed";
        setMessages((m) => [...m, { role: "assistant", text: `⚠️ ${msg}` }]);
        if (res.status === 410) {
          // Session expired — close out.
          setTimeout(() => reset(), 1500);
        }
        return;
      }
      const result = data as AnalysisResult;
      // Preserve which transactions the user had checked (by key).
      const oldSelected = selectedKeys;
      const newSet = new Set<string>();
      for (const t of result.newTransactions) {
        const k = txKey(t);
        // New txs default to selected; previously-known ones keep prior state.
        if (!oldSelected.size || oldSelected.has(k) || isNewKey(k, analysis)) {
          newSet.add(k);
        }
      }
      setAnalysis(result);
      setSelectedKeys(newSet);
      if (result.assistantReply) {
        setMessages((m) => [...m, { role: "assistant", text: result.assistantReply! }]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages((m) => [...m, { role: "assistant", text: `⚠️ ${msg}` }]);
    } finally {
      setChatBusy(false);
    }
  }

  function isNewKey(key: string, prev: AnalysisResult): boolean {
    return !prev.newTransactions.some((t) => txKey(t) === key);
  }

  async function confirm() {
    if (!analysis) return;
    const chosen = analysis.newTransactions.filter((t) => selectedKeys.has(txKey(t)));
    if (chosen.length === 0) {
      reset();
      return;
    }
    setBusy(true);
    setStatus("Adding transactions…");
    try {
      const res = await fetch("/api/transactions/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transactions: chosen }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      const summary =
        `Added ${data.createdCount} transactions` +
        (data.errors?.length ? ` (${data.errors.length} errors)` : "");
      reset();
      setStatus(summary);
      onImported();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  function toggleKey(k: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function toggleAll() {
    if (!analysis) return;
    const allKeys = analysis.newTransactions.map(txKey);
    setSelectedKeys((prev) =>
      prev.size === allKeys.length ? new Set() : new Set(allKeys),
    );
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => inputRef.current?.click()}
          disabled={busy || !!pendingFile || !!analysis}
          title="Upload a brokerage/fund statement (PDF) or a screenshot (PNG/JPG/WebP/GIF) and have AI extract transactions"
        >
          {busy ? "Analyzing…" : "Analyze Statement (AI)"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf,image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif"
          className="hidden"
          title="Choose a PDF statement or screenshot image"
          aria-label="Choose a PDF statement or screenshot image to analyze"
          onChange={onPickFile}
        />
        {status && !analysis && !pendingFile && (
          <span className="text-xs text-muted">{status}</span>
        )}
      </div>

      {/* Phase 1 modal — collect optional instructions before sending to AI. */}
      {pendingFile && !analysis && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
          <div className="card w-full max-w-xl my-8 space-y-4">
            <div>
              <h3 className="text-lg font-semibold">Analyze statement</h3>
              <p className="text-xs text-muted mt-1">{filename}</p>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="ai-instructions"
                className="block text-sm font-medium"
              >
                Optional instructions for the AI
              </label>
              <textarea
                id="ai-instructions"
                rows={5}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                disabled={busy}
                placeholder={
                  "Examples:\n• Ignore the 'Cash dividend' section.\n• The new XYZ position should equal 100 shares total.\n• Treat all distributions as DRIP (BUY)."
                }
                className="w-full rounded-md border border-border bg-panel px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-muted">
                You'll be able to refine the results in a chat with the AI before
                anything is saved.
              </p>
            </div>

            {status && (
              <div className="text-xs text-muted">{status}</div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                className="btn-ghost"
                onClick={reset}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                onClick={runAnalyze}
                disabled={busy}
              >
                {busy ? "Analyzing…" : "Analyze"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase 2 modal — review proposed transactions and refine via chat. */}
      {analysis && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
          <div className="card w-full max-w-4xl my-8 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">Review AI-extracted transactions</h3>
                <p className="text-xs text-muted mt-1">{filename}</p>
                <p className="text-sm mt-2">{analysis.statementSummary}</p>
              </div>
              <button
                type="button"
                className="btn-ghost text-xs"
                onClick={reset}
                disabled={busy}
              >
                Cancel
              </button>
            </div>

            <section>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold">
                  New transactions ({analysis.newTransactions.length})
                </h4>
                {analysis.newTransactions.length > 0 && (
                  <button
                    type="button"
                    className="text-xs text-muted hover:text-fg"
                    onClick={toggleAll}
                  >
                    {selectedKeys.size === analysis.newTransactions.length
                      ? "Deselect all"
                      : "Select all"}
                  </button>
                )}
              </div>
              {analysis.newTransactions.length === 0 ? (
                <p className="text-xs text-muted">No new transactions found.</p>
              ) : (
                <div className="overflow-x-auto border border-border rounded">
                  <table className="w-full text-xs">
                    <thead className="bg-panel2/60 text-muted uppercase tracking-wider">
                      <tr>
                        <th className="px-2 py-2 w-8"></th>
                        <th className="text-left px-2 py-2">Date</th>
                        <th className="text-left px-2 py-2">Symbol</th>
                        <th className="text-left px-2 py-2">Type</th>
                        <th className="text-left px-2 py-2">Action</th>
                        <th className="text-right px-2 py-2">Qty</th>
                        <th className="text-right px-2 py-2">Price</th>
                        <th className="text-right px-2 py-2">Fees</th>
                        <th className="text-left px-2 py-2">Firm</th>
                        <th className="text-left px-2 py-2">Account</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.newTransactions.map((t) => {
                        const k = txKey(t);
                        return (
                          <tr key={k} className="border-t border-border/60">
                            <td className="px-2 py-1.5">
                              <input
                                type="checkbox"
                                checked={selectedKeys.has(k)}
                                onChange={() => toggleKey(k)}
                                aria-label={`Include ${t.symbol} ${t.action}`}
                              />
                            </td>
                            <td className="px-2 py-1.5 tabular-nums">
                              {t.executedAt.slice(0, 10)}
                            </td>
                            <td className="px-2 py-1.5 font-semibold">{t.symbol}</td>
                            <td className="px-2 py-1.5">
                              {t.assetType === "MUTUAL_FUND"
                                ? "MF"
                                : t.assetType === "PRIVATE_EQUITY"
                                  ? "PE"
                                  : t.assetType}
                            </td>
                            <td className="px-2 py-1.5">{t.action}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              {fmtNumber(t.quantity, 6)}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              {fmtCurrency(t.price, t.currency)}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-muted">
                              {t.fees ? fmtCurrency(t.fees, t.currency) : "—"}
                            </td>
                            <td className="px-2 py-1.5 text-muted">{t.firm || "—"}</td>
                            <td className="px-2 py-1.5 text-muted">
                              {t.accountNumber || "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {analysis.duplicateTransactions.length > 0 && (
              <section>
                <h4 className="text-sm font-semibold mb-2">
                  Skipped as duplicates ({analysis.duplicateTransactions.length})
                </h4>
                <ul className="text-xs text-muted space-y-1">
                  {analysis.duplicateTransactions.map((t, i) => (
                    <li key={i}>
                      {t.executedAt.slice(0, 10)} · {t.symbol} · {t.action} ·{" "}
                      {fmtNumber(t.quantity, 6)} @ {fmtCurrency(t.price, t.currency)}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {analysis.positionChanges.length > 0 && (
              <section>
                <h4 className="text-sm font-semibold mb-2">
                  Position changes ({analysis.positionChanges.length})
                </h4>
                <div className="overflow-x-auto border border-border rounded">
                  <table className="w-full text-xs">
                    <thead className="bg-panel2/60 text-muted uppercase tracking-wider">
                      <tr>
                        <th className="text-left px-2 py-2">Symbol</th>
                        <th className="text-left px-2 py-2">Firm / Acct</th>
                        <th className="text-right px-2 py-2">Qty (before → after)</th>
                        <th className="text-right px-2 py-2">
                          Book value (before → after)
                        </th>
                        <th className="text-right px-2 py-2">
                          Realized (before → after)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.positionChanges.map((c) => {
                        const qtyChanged = Math.abs(c.beforeQty - c.afterQty) > 1e-9;
                        const bookChanged = Math.abs(c.beforeBook - c.afterBook) > 1e-4;
                        const realizedChanged =
                          Math.abs(c.beforeRealized - c.afterRealized) > 1e-4;
                        return (
                          <tr key={c.key} className="border-t border-border/60">
                            <td className="px-2 py-1.5 font-semibold">{c.symbol}</td>
                            <td className="px-2 py-1.5 text-muted">
                              {c.firm || "—"}
                              {c.accountNumber ? ` · ${c.accountNumber}` : ""}
                            </td>
                            <td
                              className={`px-2 py-1.5 text-right tabular-nums ${
                                qtyChanged ? "" : "text-muted"
                              }`}
                            >
                              {fmtNumber(c.beforeQty, 6)} → {fmtNumber(c.afterQty, 6)}
                            </td>
                            <td
                              className={`px-2 py-1.5 text-right tabular-nums ${
                                bookChanged ? "" : "text-muted"
                              }`}
                            >
                              {fmtCurrency(c.beforeBook, c.currency)} →{" "}
                              {fmtCurrency(c.afterBook, c.currency)}
                            </td>
                            <td
                              className={`px-2 py-1.5 text-right tabular-nums ${
                                realizedChanged ? "" : "text-muted"
                              }`}
                            >
                              {fmtCurrency(c.beforeRealized, c.currency)} →{" "}
                              {fmtCurrency(c.afterRealized, c.currency)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Refine-with-AI chat panel. */}
            <section className="border-t border-border pt-3">
              <h4 className="text-sm font-semibold mb-2">Refine with AI</h4>
              <div
                ref={chatScrollRef}
                className="border border-border rounded bg-panel2/40 p-3 max-h-72 overflow-y-auto space-y-3 text-sm"
              >
                {messages.length === 0 && !chatBusy && (
                  <p className="text-xs text-muted">
                    Ask the AI to adjust the proposed transactions — e.g. "Combine
                    the two MSFT BUY rows into one of 25 shares" or "Ignore the
                    distribution on Apr 30".
                  </p>
                )}
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={
                      m.role === "user"
                        ? "ml-8 rounded-md bg-blue-500/10 border border-blue-500/30 px-3 py-2"
                        : "mr-8 rounded-md bg-panel border border-border px-3 py-2"
                    }
                  >
                    <div className="text-[10px] uppercase tracking-wider text-muted mb-1">
                      {m.role === "user" ? "You" : "AI"}
                    </div>
                    {m.role === "assistant" ? (
                      <div className="space-y-2">{renderMarkdown(m.text)}</div>
                    ) : (
                      <div className="whitespace-pre-wrap">{m.text}</div>
                    )}
                  </div>
                ))}
                {chatBusy && (
                  <div className="mr-8 rounded-md bg-panel border border-border px-3 py-2 text-xs text-muted">
                    AI is thinking…
                  </div>
                )}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendChat();
                    }
                  }}
                  disabled={chatBusy || busy}
                  placeholder="Ask the AI to adjust the proposal…"
                  className="flex-1 rounded-md border border-border bg-panel px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={sendChat}
                  disabled={chatBusy || busy || !chatInput.trim()}
                >
                  {chatBusy ? "Sending…" : "Send"}
                </button>
              </div>
            </section>

            <div className="flex items-center justify-between pt-2 border-t border-border">
              {status && <span className="text-xs text-muted">{status}</span>}
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={reset}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={confirm}
                  disabled={busy || selectedKeys.size === 0}
                >
                  {busy
                    ? "Adding…"
                    : `Add ${selectedKeys.size} transaction${
                        selectedKeys.size === 1 ? "" : "s"
                      }`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
