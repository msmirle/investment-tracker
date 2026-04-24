// One-shot import of Kathryn Easter's Investia holdings from the Q1 2026 statement
// (period Jan 1 2026 – Mar 31 2026). Mirrors scripts/import-investia-2026.mjs
// but for the second Investia client. Each holding becomes a single synthetic
// BUY transaction at average cost (book cost ÷ units), trade-dated the start
// of the statement period, since original purchase history isn't on this
// statement. Cash Control Account balances are not imported (not a tradable fund).
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ASSET = "MUTUAL_FUND";
const CUR = "CAD";
const DATE = new Date("2026-01-01T00:00:00Z");
const FIRM = "Investia - Kathryn";
const NOTE = "Synthetic position opener from Investia Q1 2026 statement (book-cost average). Client ID 221359395.";

const holdings = [
  // Spousal Retirement Savings Plan #338201045 (nominee)
  { account: "Investia SRSP", accountNumber: "SRSP - 338201045", symbol: "DYN037",  name: "Dynamic Diversified Inflation Focused Series A",        qty: 2434.1411, book: 28029.38 },
  { account: "Investia SRSP", accountNumber: "SRSP - 338201045", symbol: "FID7251", name: "Fidelity Inflation-Focused Series B",                   qty: 4397.0641, book: 45780.03 },
  { account: "Investia SRSP", accountNumber: "SRSP - 338201045", symbol: "CCM2470", name: "IA Clarington Loomis Global Allocation Series A",       qty: 1027.8200, book: 25965.61 },
  { account: "Investia SRSP", accountNumber: "SRSP - 338201045", symbol: "TDB320",  name: "TD Health Sciences",                                    qty:  949.9210, book: 49519.48 },
  { account: "Investia SRSP", accountNumber: "SRSP - 338201045", symbol: "TDB684",  name: "TD North American Dividend",                            qty: 3590.1540, book: 75154.13 },
  { account: "Investia SRSP", accountNumber: "SRSP - 338201045", symbol: "TDB2581", name: "TD Tactical Monthly Income",                            qty: 4921.8620, book: 58190.68 },
  // Registered Education Savings Plan (client-name) — fund account #434214177
  { account: "Investia RESP", accountNumber: "RESP - 434214177", symbol: "DYN5000", name: "Dynamic BNST Tiered Investment Savings Account",       qty: 61233.1405, book: 61233.14 },
];

for (const h of holdings) {
  const price = h.book / h.qty;
  await prisma.transaction.create({
    data: {
      symbol: h.symbol,
      name: h.name,
      assetType: ASSET,
      action: "BUY",
      quantity: h.qty,
      price,
      fees: 0,
      currency: CUR,
      account: h.account,
      firm: FIRM,
      accountNumber: h.accountNumber,
      orderType: "MARKET",
      executedAt: DATE,
      notes: NOTE,
    },
  });
  console.log(`Added ${h.symbol} (${h.account}): ${h.qty} @ ${price.toFixed(4)} ${CUR} = $${h.book.toFixed(2)} book`);
}

const total = await prisma.transaction.count();
console.log(`\nTotal transactions now: ${total}`);
await prisma.$disconnect();
