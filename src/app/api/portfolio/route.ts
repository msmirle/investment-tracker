import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureMigrated } from "@/lib/migrate";
import { aggregateTransactions, evaluatePositions } from "@/lib/positions";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await ensureMigrated();
  const url = new URL(req.url);
  const display = (url.searchParams.get("currency") || "USD").toUpperCase();
  const firms = url.searchParams.getAll("firm").filter(Boolean);
  const txs = await prisma.transaction.findMany({
    where: firms.length > 0 ? { firm: { in: firms } } : undefined,
  });
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
      firm: t.firm,
      accountNumber: t.accountNumber,
      orderType: t.orderType,
      executedAt: t.executedAt,
      notes: t.notes,
    })),
  );
  const evaluated = await evaluatePositions(positions, display);
  return NextResponse.json({ displayCurrency: display, holdings: evaluated });
}
