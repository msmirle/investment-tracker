import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureMigrated } from "@/lib/migrate";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureMigrated();
  const txs = await prisma.transaction.findMany({
    orderBy: [{ executedAt: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(txs);
}

interface TxBody {
  symbol?: string;
  name?: string | null;
  assetType?: string;
  action?: string;
  quantity?: number;
  price?: number;
  fees?: number;
  currency?: string;
  account?: string | null;
  firm?: string | null;
  accountNumber?: string | null;
  orderType?: string | null;
  executedAt?: string;
  notes?: string | null;
}

function validate(b: TxBody): string | null {
  if (!b.symbol || typeof b.symbol !== "string") return "symbol is required";
  if (!b.assetType || !["STOCK", "ETF", "CRYPTO", "MUTUAL_FUND"].includes(b.assetType))
    return "assetType must be STOCK|ETF|CRYPTO|MUTUAL_FUND";
  if (!b.action || !["BUY", "SELL"].includes(b.action)) return "action must be BUY|SELL";
  if (typeof b.quantity !== "number" || b.quantity <= 0) return "quantity must be > 0";
  if (typeof b.price !== "number" || b.price < 0) return "price must be >= 0";
  if (!b.executedAt) return "executedAt is required";
  return null;
}

export async function POST(req: Request) {
  await ensureMigrated();
  const body = (await req.json()) as TxBody;
  const err = validate(body);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const created = await prisma.transaction.create({
    data: {
      symbol: body.symbol!.toUpperCase().trim(),
      name: body.name?.trim() || null,
      assetType: body.assetType!,
      action: body.action!,
      quantity: body.quantity!,
      price: body.price!,
      fees: body.fees ?? 0,
      currency: (body.currency || "USD").toUpperCase(),
      account: body.account?.trim() || null,
      firm: body.firm?.trim() || null,
      accountNumber: body.accountNumber?.trim() || null,
      orderType: body.orderType?.trim() || null,
      executedAt: new Date(body.executedAt!),
      notes: body.notes?.trim() || null,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
