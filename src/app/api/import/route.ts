import { NextResponse } from "next/server";
import Papa from "papaparse";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Expected CSV columns (case-insensitive):
//   symbol, assetType (STOCK|ETF|CRYPTO|MUTUAL_FUND), action (BUY|SELL), quantity, price,
//   fees, currency, name, executedAt, account, orderType, notes
export async function POST(req: Request) {
  const text = await req.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  if (parsed.errors.length > 0) {
    return NextResponse.json({ error: "Invalid CSV", details: parsed.errors.slice(0, 5) }, { status: 400 });
  }

  const rows = parsed.data;
  const created: unknown[] = [];
  const errors: Array<{ row: number; error: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const symbol = (r.symbol || "").toUpperCase().trim();
      const assetType = (r.assettype || r.type || "STOCK").toUpperCase().trim();
      const action = (r.action || "BUY").toUpperCase().trim();
      const quantity = parseFloat(r.quantity);
      const price = parseFloat(r.price || r.fillprice || "0");
      const fees = parseFloat(r.fees || "0");
      if (!symbol) throw new Error("missing symbol");
      if (!["STOCK", "ETF", "CRYPTO", "MUTUAL_FUND"].includes(assetType)) throw new Error("invalid assetType");
      if (!["BUY", "SELL"].includes(action)) throw new Error("invalid action");
      if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("invalid quantity");
      if (!Number.isFinite(price) || price < 0) throw new Error("invalid price");
      const executedAtRaw = r.executedat || r.date || r.timeplaced;
      const executedAt = executedAtRaw ? new Date(executedAtRaw) : new Date();
      if (isNaN(executedAt.getTime())) throw new Error("invalid executedAt");
      const row = await prisma.transaction.create({
        data: {
          symbol,
          assetType,
          action,
          quantity,
          price,
          fees: Number.isFinite(fees) ? fees : 0,
          currency: (r.currency || "USD").toUpperCase().trim(),
          name: r.name?.trim() || null,
          account: r.account?.trim() || null,
          orderType: (r.ordertype || r.order)?.trim() || null,
          executedAt,
          notes: r.notes?.trim() || null,
        },
      });
      created.push(row);
    } catch (e) {
      errors.push({ row: i + 2, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({ importedCount: created.length, errors });
}
