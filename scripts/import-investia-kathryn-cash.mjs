// Import Kathryn Easter's Cash Control Account balance as a CASH-CAD position.
// Uses a SymbolMeta manualPrice of $1.00 CAD so no network quote is needed.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SYMBOL = "CASH-CAD";

await prisma.symbolMeta.upsert({
  where: { symbol: SYMBOL },
  update: { manualPrice: 1.0, manualPriceCurrency: "CAD" },
  create: { symbol: SYMBOL, manualPrice: 1.0, manualPriceCurrency: "CAD" },
});

const tx = await prisma.transaction.create({
  data: {
    symbol: SYMBOL,
    name: "Cash Control Account (CAD)",
    assetType: "STOCK",
    action: "BUY",
    quantity: 52785.81,
    price: 1.0,
    fees: 0,
    currency: "CAD",
    account: "Investia SRSP",
    firm: "Investia - Kathryn",
    accountNumber: "SRSP - 338201045",
    orderType: "MARKET",
    executedAt: new Date("2026-03-31T00:00:00Z"),
    notes: "Cash Control Account #338201046 balance as at Mar 31 2026 (Q1 2026 statement).",
  },
});

console.log("Added", tx.symbol, "$", tx.quantity.toFixed(2), "CAD in", tx.accountNumber);
await prisma.$disconnect();
