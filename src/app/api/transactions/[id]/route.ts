import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface PatchBody {
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

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await prisma.transaction.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json()) as PatchBody;
  const data: Record<string, unknown> = {};
  if (body.symbol !== undefined) data.symbol = body.symbol.toUpperCase().trim();
  if (body.name !== undefined) data.name = body.name?.trim() || null;
  if (body.assetType !== undefined && ["STOCK", "ETF", "CRYPTO", "MUTUAL_FUND", "PRIVATE_EQUITY"].includes(body.assetType))
    data.assetType = body.assetType;
  if (body.action !== undefined && ["BUY", "SELL"].includes(body.action)) data.action = body.action;
  if (body.quantity !== undefined) data.quantity = body.quantity;
  if (body.price !== undefined) data.price = body.price;
  if (body.fees !== undefined) data.fees = body.fees;
  if (body.currency !== undefined) data.currency = body.currency.toUpperCase();
  if (body.account !== undefined) data.account = body.account?.trim() || null;
  if (body.firm !== undefined) data.firm = body.firm?.trim() || null;
  if (body.accountNumber !== undefined) data.accountNumber = body.accountNumber?.trim() || null;
  if (body.orderType !== undefined) data.orderType = body.orderType?.trim() || null;
  if (body.executedAt !== undefined) data.executedAt = new Date(body.executedAt);
  if (body.notes !== undefined) data.notes = body.notes?.trim() || null;
  const updated = await prisma.transaction.update({ where: { id }, data });
  return NextResponse.json(updated);
}
