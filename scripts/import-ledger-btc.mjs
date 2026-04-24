// Import Ledger Wallet BTC holding as of Apr 23 2026.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const FIRM = "Ledger Wallet";
const CUR = "CAD";
const DATE = new Date("2026-04-23T00:00:00Z");
const NOTE = "Synthetic position opener from Ledger Wallet balance as of Apr 23 2026.";

// 0.550574 BTC @ CA$59,123.89 total → avg cost CA$107,388.12 / BTC (no historical basis reported)
const qty = 0.550574;
const book = 59123.89;
const price = book / qty;

await prisma.transaction.create({
  data: {
    symbol: "BTC",
    name: "Bitcoin",
    assetType: "CRYPTO",
    action: "BUY",
    quantity: qty,
    price,
    fees: 0,
    currency: CUR,
    account: "Ledger Wallet (Bitcoin 1)",
    firm: FIRM,
    accountNumber: null,
    orderType: "MARKET",
    executedAt: DATE,
    notes: NOTE,
  },
});

console.log(`Added BTC: ${qty} @ ${price.toFixed(2)} ${CUR} = $${book.toFixed(2)} book`);

await prisma.$disconnect();
