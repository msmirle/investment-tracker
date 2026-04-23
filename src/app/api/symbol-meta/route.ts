import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await prisma.symbolMeta.findMany({ orderBy: { symbol: "asc" } });
  return NextResponse.json(rows);
}

interface Body {
  symbol?: string;
  quoteSymbol?: string | null;
  manualPrice?: number | null;
  manualPriceCurrency?: string | null;
  manualPriceAsOf?: string | null;
  notes?: string | null;
}

export async function PUT(req: Request) {
  const body = (await req.json()) as Body;
  if (!body.symbol || typeof body.symbol !== "string") {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  }
  const symbol = body.symbol.toUpperCase().trim();
  const data = {
    quoteSymbol: body.quoteSymbol?.trim() || null,
    manualPrice:
      body.manualPrice == null || body.manualPrice === ("" as unknown as number)
        ? null
        : Number(body.manualPrice),
    manualPriceCurrency: body.manualPriceCurrency?.toUpperCase().trim() || null,
    manualPriceAsOf: body.manualPriceAsOf ? new Date(body.manualPriceAsOf) : null,
    notes: body.notes?.trim() || null,
  };
  const row = await prisma.symbolMeta.upsert({
    where: { symbol },
    create: { symbol, ...data },
    update: data,
  });
  return NextResponse.json(row);
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol")?.toUpperCase().trim();
  if (!symbol) return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  await prisma.symbolMeta.delete({ where: { symbol } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
