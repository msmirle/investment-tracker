"use client";
import { useEffect, useRef, useState } from "react";
import { renderMarkdown } from "@/lib/markdown";

interface AdvisorResult {
  analysis: string;
  asOf: string;
  totalMarketValue: number;
  displayCurrency: string;
  holdingsCount: number;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function AdvisorButton({ currency }: { currency: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<AdvisorResult | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  async function run() {
    setBusy(true);
    setErr(null);
    setResult(null);
    setMessages([]);
    try {
      const res = await fetch("/api/advisor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currency }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      setResult(data as AdvisorResult);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setResult(null);
    setMessages([]);
    setInput("");
  }

  async function send() {
    const text = input.trim();
    if (!text || sending || !result) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setSending(true);
    try {
      const res = await fetch("/api/advisor/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          currency,
          priorAnalysis: result.analysis,
          messages: next,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Chat failed");
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `_Error: ${e instanceof Error ? e.message : String(e)}_`,
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn-ghost"
        onClick={run}
        disabled={busy}
        title="Get an AI-generated portfolio review"
      >
        {busy ? "Analyzing…" : "AI Advisor"}
      </button>
      {err && <span className="text-xs text-bad">{err}</span>}

      {result && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
          <div className="card w-full max-w-3xl my-8 flex flex-col max-h-[92vh]">
            <div className="flex items-start justify-between gap-4 pb-3 border-b border-border">
              <div>
                <h3 className="text-lg font-semibold">Virtual Investment Advisor</h3>
                <p className="text-xs text-muted mt-1">
                  As of {result.asOf} · {result.holdingsCount} holdings ·
                  {" "}
                  <span className="sensitive">
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: result.displayCurrency,
                      maximumFractionDigits: 0,
                    }).format(result.totalMarketValue)}
                  </span>
                </p>
              </div>
              <button type="button" className="btn-ghost text-xs" onClick={close}>
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-3 pr-2 space-y-4 text-sm leading-relaxed">
              <article className="chart-sensitive">{renderMarkdown(result.analysis)}</article>

              {messages.length > 0 && (
                <div className="border-t border-border pt-3 space-y-3">
                  {messages.map((m, i) => (
                    <div
                      key={i}
                      className={
                        m.role === "user"
                          ? "bg-accent/10 border border-accent/30 rounded-lg px-3 py-2 ml-8"
                          : "bg-panel2 border border-border rounded-lg px-3 py-2 mr-8"
                      }
                    >
                      <div className="text-[10px] uppercase tracking-wider text-muted mb-1">
                        {m.role === "user" ? "You" : "Advisor"}
                      </div>
                      {m.role === "user" ? (
                        <div className="whitespace-pre-wrap">{m.content}</div>
                      ) : (
                        <article className="chart-sensitive">{renderMarkdown(m.content)}</article>
                      )}
                    </div>
                  ))}
                  {sending && (
                    <div className="bg-panel2 border border-border rounded-lg px-3 py-2 mr-8 text-muted text-xs">
                      Advisor is thinking…
                    </div>
                  )}
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="pt-3 border-t border-border flex items-end gap-2">
              <textarea
                className="input flex-1 min-h-[2.5rem] max-h-40 resize-y"
                rows={1}
                placeholder="Ask a follow-up question… (Enter to send, Shift+Enter for newline)"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKey}
                disabled={sending}
                aria-label="Message the advisor"
              />
              <button
                type="button"
                className="btn"
                onClick={send}
                disabled={sending || !input.trim()}
              >
                {sending ? "…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
