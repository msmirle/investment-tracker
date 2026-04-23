import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureMigrated } from "@/lib/migrate";
import { aggregateTransactions, portfolioHistory } from "@/lib/positions";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await ensureMigrated();
  const url = new URL(req.url);
  const display = (url.searchParams.get("currency") || "USD").toUpperCase();
  const days = Math.max(7, Math.min(1825, parseInt(url.searchParams.get("days") || "180", 10)));
  const txs = await prisma.transaction.findMany();
  const positions = aggregateTransactions(
    txs.map((t) => ({
      id: t.id,
      symbol: t.symbol,
      name: t.name,
      assetType: t.assetType,
      action: t.action,
      quantity: t.quantity,
      price: t.price,
      fees: t.fees,
      currency: t.currency,
      account: t.account,
      orderType: t.orderType,
      executedAt: t.executedAt,
      notes: t.notes,
    })),
  );
  const series = await portfolioHistory(positions, display, days);
  return NextResponse.json({ displayCurrency: display, days, series });
}
