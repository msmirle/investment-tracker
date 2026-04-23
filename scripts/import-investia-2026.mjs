// One-shot import of Investia holdings from the Q1 2026 statement
// (period Jan 1 2026 – Mar 31 2026). Each holding becomes a single synthetic
// BUY transaction at average cost (book cost ÷ units), trade-dated the start
// of the statement period, since original purchase history isn't on this
// statement.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ASSET = "MUTUAL_FUND";
const CUR = "CAD";
const DATE = new Date("2026-01-01T00:00:00Z"); // statement period open
const NOTE = "Synthetic position opener from Investia Q1 2026 statement (book-cost average). Client ID 218087011.";

const holdings = [
  // RRSP #317382565
  { account: "Investia RRSP",  symbol: "FID7251",  name: "Fidelity Inflation-Focused Series B",              qty: 5939.8342, book: 61858.62 },
  // CCM is the IA Clarington FundServ prefix (statement shows IA Clarington but fund code 2470 resolves as CCM2470 on Fundata/Globe & Mail)
  { account: "Investia RRSP",  symbol: "CCM2470",  name: "IA Clarington Loomis Global Allocation Series A",  qty: 1119.1550, book: 28272.99 },
  { account: "Investia RRSP",  symbol: "TDB652",   name: "TD Global Entertainment & Communication Series I", qty:   73.8880, book: 11265.47 },
  { account: "Investia RRSP",  symbol: "TDB310",   name: "TD US Capital Reinvestment Advisor Series",        qty: 2306.8640, book: 70420.02 },
  // LIRA #317386660
  { account: "Investia LIRA",  symbol: "DYN037",   name: "Dynamic Diversified Inflation Focused Series A",   qty: 1006.7924, book: 11562.51 },
  { account: "Investia LIRA",  symbol: "FID299",   name: "Fidelity Global Health Care Series B",             qty:  292.4358, book: 15811.86 },
  // TFSA #317387586
  { account: "Investia TFSA",  symbol: "TDB627",   name: "TD Dividend Income Series I",                      qty:  649.9480, book: 31778.04 },
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
