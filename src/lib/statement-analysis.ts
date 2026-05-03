// Shared post-extraction logic for the statement analyzer endpoints
// (`/api/analyze-statement` and `/api/analyze-statement/chat`).
//
// Given the model's structured output, this:
//   1. Normalizes/filters the proposed transactions.
//   2. Splits them into "new" vs "duplicates of existing DB rows".
//   3. Computes before/after position projections.
//
// Also exposes a tiny in-memory session cache that ties an `analysisId` to
// the OpenAI Responses API `previous_response_id`, so follow-up chat turns
// can refine the proposal without re-uploading the file.

import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { aggregateTransactions, type TransactionRow } from "@/lib/positions";

export interface ExtractedTx {
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
  executedAt: string; // YYYY-MM-DD on input
  notes?: string | null;
}

export interface ExtractionResult {
  statementSummary: string;
  transactions: ExtractedTx[];
  // Optional — only present on chat-turn responses.
  assistantReply?: string;
}

export interface NormalizedTx {
  symbol: string;
  name: string | null;
  assetType: ExtractedTx["assetType"];
  action: ExtractedTx["action"];
  quantity: number;
  price: number;
  fees: number;
  currency: string;
  firm: string | null;
  accountNumber: string | null;
  executedAt: Date;
  notes: string | null;
}

export interface PositionChange {
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

export interface AnalysisOutput {
  statementSummary: string;
  newTransactions: Array<Omit<NormalizedTx, "executedAt"> & { executedAt: string }>;
  duplicateTransactions: Array<Omit<NormalizedTx, "executedAt"> & { executedAt: string }>;
  positionChanges: PositionChange[];
  assistantReply?: string;
}

function sameDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

function normalize(tx: ExtractedTx): NormalizedTx {
  return {
    symbol: (tx.symbol || "").toUpperCase().trim(),
    name: tx.name?.trim() || null,
    assetType: tx.assetType,
    action: tx.action,
    quantity: Number(tx.quantity) || 0,
    price: Number(tx.price) || 0,
    fees: tx.fees != null && isFinite(Number(tx.fees)) ? Number(tx.fees) : 0,
    currency: (tx.currency || "USD").toUpperCase().trim(),
    firm: tx.firm?.trim() || null,
    accountNumber: tx.accountNumber?.trim() || null,
    executedAt: new Date(tx.executedAt),
    notes: tx.notes?.trim() || null,
  };
}

/**
 * Given the model's structured output, classify proposed transactions
 * against the existing DB and project position changes.
 */
export async function buildAnalysisOutput(
  parsed: ExtractionResult,
): Promise<AnalysisOutput> {
  const extracted = (parsed.transactions || [])
    .map(normalize)
    .filter(
      (t) =>
        t.symbol &&
        isFinite(t.quantity) &&
        t.quantity > 0 &&
        isFinite(t.price) &&
        !isNaN(t.executedAt.getTime()),
    );

  const symbols = Array.from(new Set(extracted.map((t) => t.symbol)));
  const existingDb = symbols.length
    ? await prisma.transaction.findMany({ where: { symbol: { in: symbols } } })
    : [];

  const newTxs: NormalizedTx[] = [];
  const duplicateTxs: NormalizedTx[] = [];
  for (const t of extracted) {
    const dup = existingDb.find(
      (e) =>
        e.symbol.toUpperCase() === t.symbol &&
        e.action.toUpperCase() === t.action &&
        sameDay(new Date(e.executedAt), t.executedAt) &&
        Math.abs(e.quantity - t.quantity) < 1e-6 &&
        Math.abs(e.price - t.price) < 1e-4 &&
        (e.firm ?? null) === t.firm,
    );
    if (dup) duplicateTxs.push(t);
    else newTxs.push(t);
  }

  const allExistingAffected = symbols.length
    ? await prisma.transaction.findMany({ where: { symbol: { in: symbols } } })
    : [];
  const existingRows: TransactionRow[] = allExistingAffected.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    name: r.name,
    assetType: r.assetType,
    action: r.action,
    quantity: r.quantity,
    price: r.price,
    fees: r.fees,
    currency: r.currency,
    account: r.account,
    firm: r.firm,
    accountNumber: r.accountNumber,
    orderType: r.orderType,
    executedAt: r.executedAt,
    notes: r.notes,
  }));
  const before = aggregateTransactions(existingRows);
  const projectedRows: TransactionRow[] = [
    ...existingRows,
    ...newTxs.map((t, i) => ({
      id: `proposed-${i}`,
      symbol: t.symbol,
      name: t.name,
      assetType: t.assetType,
      action: t.action,
      quantity: t.quantity,
      price: t.price,
      fees: t.fees,
      currency: t.currency,
      account: null,
      firm: t.firm,
      accountNumber: t.accountNumber,
      orderType: null,
      executedAt: t.executedAt,
      notes: t.notes,
    })),
  ];
  const after = aggregateTransactions(projectedRows);

  const changes: PositionChange[] = [];
  const keys = new Set<string>();
  for (const p of before) keys.add(p.key);
  for (const p of after) keys.add(p.key);
  for (const key of keys) {
    const b = before.find((p) => p.key === key);
    const a = after.find((p) => p.key === key);
    const beforeQty = b?.quantity ?? 0;
    const afterQty = a?.quantity ?? 0;
    const beforeBook = b?.costBasis ?? 0;
    const afterBook = a?.costBasis ?? 0;
    const beforeRealized = b?.realizedGain ?? 0;
    const afterRealized = a?.realizedGain ?? 0;
    if (
      Math.abs(beforeQty - afterQty) > 1e-9 ||
      Math.abs(beforeBook - afterBook) > 1e-4 ||
      Math.abs(beforeRealized - afterRealized) > 1e-4
    ) {
      const [symbol, , currency, firm, accountNumber] = key.split("|");
      changes.push({
        key,
        symbol,
        firm: firm || null,
        accountNumber: accountNumber || null,
        currency,
        beforeQty,
        afterQty,
        beforeBook,
        afterBook,
        beforeRealized,
        afterRealized,
      });
    }
  }
  changes.sort((a, b) => a.symbol.localeCompare(b.symbol));

  const toWire = (t: NormalizedTx) => ({ ...t, executedAt: t.executedAt.toISOString() });

  return {
    statementSummary: parsed.statementSummary,
    newTransactions: newTxs.map(toWire),
    duplicateTransactions: duplicateTxs.map(toWire),
    positionChanges: changes,
    assistantReply: parsed.assistantReply,
  };
}

// ---------------------------------------------------------------------------
// In-memory analysis-session cache.
//
// Keyed by a random `analysisId` that we hand back to the client on the
// initial extract. Stores the most recent OpenAI Responses API
// `previous_response_id` so chat-turn refinements can chain off the same
// upload without re-sending the file.
//
// Single-process only — fine for one container. TTL 30 min, capped at 50
// entries (oldest evicted).
// ---------------------------------------------------------------------------

const SESSION_TTL_MS = 30 * 60 * 1000;
const SESSION_MAX = 50;

interface Session {
  previousResponseId: string;
  createdAt: number;
  lastUsedAt: number;
}

// Stash on globalThis so Next.js dev HMR doesn't wipe the cache when this
// module gets reloaded after a file edit.
const globalForSessions = globalThis as unknown as {
  __statementSessions?: Map<string, Session>;
};
const sessions: Map<string, Session> =
  globalForSessions.__statementSessions ?? new Map<string, Session>();
if (!globalForSessions.__statementSessions) {
  globalForSessions.__statementSessions = sessions;
}

function purge(): void {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, s] of sessions) {
    if (s.lastUsedAt < cutoff) sessions.delete(id);
  }
  if (sessions.size > SESSION_MAX) {
    // Evict oldest by lastUsedAt.
    const sorted = [...sessions.entries()].sort(
      (a, b) => a[1].lastUsedAt - b[1].lastUsedAt,
    );
    const drop = sessions.size - SESSION_MAX;
    for (let i = 0; i < drop; i++) sessions.delete(sorted[i][0]);
  }
}

export function createAnalysisSession(previousResponseId: string): string {
  purge();
  const id = crypto.randomBytes(16).toString("hex");
  const now = Date.now();
  sessions.set(id, { previousResponseId, createdAt: now, lastUsedAt: now });
  return id;
}

export function getAnalysisSession(id: string): Session | undefined {
  purge();
  const s = sessions.get(id);
  if (!s) return undefined;
  s.lastUsedAt = Date.now();
  return s;
}

export function updateAnalysisSession(id: string, previousResponseId: string): void {
  const s = sessions.get(id);
  if (!s) return;
  s.previousResponseId = previousResponseId;
  s.lastUsedAt = Date.now();
}
