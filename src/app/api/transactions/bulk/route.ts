import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureMigrated } from "@/lib/migrate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface BulkTx {
  symbol: string;
  name?: string | null;
  assetType: string;
  action: string;
  quantity: number;
  price: number;
  fees?: number;
  currency: string;
  firm?: string | null;
  accountNumber?: string | null;
  executedAt: string;
  notes?: string | null;
}

export async function POST(req: Request) {
  await ensureMigrated();
  const body = (await req.json()) as { transactions?: BulkTx[] };
  const items = Array.isArray(body.transactions) ? body.transactions : [];
  if (items.length === 0) {
    return NextResponse.json({ error: "No transactions supplied" }, { status: 400 });
  }

  const errors: Array<{ index: number; error: string }> = [];
  const created: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const t = items[i];
    try {
      const action = (t.action || "").toUpperCase();
      const assetType = (t.assetType || "").toUpperCase();
      if (!t.symbol) throw new Error("symbol required");
      if (!["BUY", "SELL", "DIST"].includes(action)) throw new Error("invalid action");
      if (!["STOCK", "ETF", "CRYPTO", "MUTUAL_FUND"].includes(assetType)) throw new Error("invalid assetType");
      if (!isFinite(t.quantity) || t.quantity <= 0) throw new Error("invalid quantity");
      if (!isFinite(t.price) || t.price < 0) throw new Error("invalid price");
      const executedAt = new Date(t.executedAt);
      if (isNaN(executedAt.getTime())) throw new Error("invalid executedAt");
      const row = await prisma.transaction.create({
        data: {
          symbol: t.symbol.toUpperCase().trim(),
          name: t.name?.trim() || null,
          assetType,
          action,
          quantity: t.quantity,
          price: t.price,
          fees: t.fees ?? 0,
          currency: (t.currency || "USD").toUpperCase().trim(),
          firm: t.firm?.trim() || null,
          accountNumber: t.accountNumber?.trim() || null,
          executedAt,
          notes: t.notes?.trim() || null,
        },
      });
      created.push(row.id);
    } catch (err) {
      errors.push({ index: i, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return NextResponse.json({ createdCount: created.length, createdIds: created, errors });
}
