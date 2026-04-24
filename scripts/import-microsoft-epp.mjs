// Import Microsoft EPP (Fidelity) holdings as of Apr 23 2026.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const FIRM = "Microsoft EPP";
const CUR = "USD";
const DATE = new Date("2026-04-23T00:00:00Z");
const NOTE = "Synthetic position opener from Fidelity EPP holdings as of Apr 23 2026.";

const holdings = [
  // FYIXX is a money-market fund at $1.00 NAV; no cost basis reported on statement.
  { symbol: "FYIXX", name: "Fidelity Treasury Only Money Market Fund Class I", qty: 971.0200, book: 971.02, manualPrice: 1.0 },
  // MSFT: 418.8260 shares, book $97,364.22 total → avg cost $232.4689
  { symbol: "MSFT",  name: "Microsoft Corp",                                    qty: 418.8260, book: 97364.22, manualPrice: null },
];

for (const h of holdings) {
  if (h.manualPrice != null) {
    await prisma.symbolMeta.upsert({
      where: { symbol: h.symbol },
      update: { manualPrice: h.manualPrice, manualPriceCurrency: CUR },
      create: { symbol: h.symbol, manualPrice: h.manualPrice, manualPriceCurrency: CUR },
    });
  }
  const price = h.book / h.qty;
  await prisma.transaction.create({
    data: {
      symbol: h.symbol,
      name: h.name,
      assetType: "STOCK",
      action: "BUY",
      quantity: h.qty,
      price,
      fees: 0,
      currency: CUR,
      account: "Microsoft EPP (Fidelity)",
      firm: FIRM,
      accountNumber: null,
      orderType: "MARKET",
      executedAt: DATE,
      notes: NOTE,
    },
  });
  console.log(`Added ${h.symbol}: ${h.qty} @ ${price.toFixed(4)} ${CUR} = $${h.book.toFixed(2)} book`);
}

await prisma.$disconnect();
