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
  const firms = url.searchParams.getAll("firm").filter(Boolean);
  const symbol = url.searchParams.get("symbol");
  const accountNumber = url.searchParams.get("accountNumber");
  const assetType = url.searchParams.get("assetType");
  const vehicle = url.searchParams.get("vehicle");
  const where: Record<string, unknown> = {};
  if (firms.length === 1) where.firm = firms[0];
  else if (firms.length > 1) where.firm = { in: firms };
  if (symbol) where.symbol = symbol;
  if (accountNumber) where.accountNumber = accountNumber;
  if (assetType) {
    // Allow short labels "MF"/"PE" as aliases.
    const u = assetType.toUpperCase();
    const full = u === "MF" ? "MUTUAL_FUND" : u === "PE" ? "PRIVATE_EQUITY" : u;
    where.assetType = full;
  }
  let txs = await prisma.transaction.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
  });
  if (vehicle) {
    // Match the same logic as AllocationChart.vehicleOf().
    const VEHICLE_TYPES = ["RRSP", "TFSA", "RESP", "LIRA", "SRSP", "RRIF", "RIF", "Margin", "Cash"];
    const re = new RegExp(`\\b(${VEHICLE_TYPES.join("|")})\\b`, "i");
    function vehicleOf(accountNumber?: string | null, account?: string | null): string {
      const probe = `${accountNumber ?? ""} ${account ?? ""}`;
      const m = probe.match(re);
      if (!m) return "Other";
      const found = m[1].toUpperCase();
      if (found === "RIF") return "RRIF";
      if (found === "MARGIN") return "Margin";
      if (found === "CASH") return "Cash";
      return found;
    }
    txs = txs.filter((t) => vehicleOf(t.accountNumber, t.account) === vehicle);
  }
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
  const series = await portfolioHistory(positions, display, days);
  return NextResponse.json({ displayCurrency: display, days, series });
}
