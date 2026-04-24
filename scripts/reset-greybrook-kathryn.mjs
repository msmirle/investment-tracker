// Greybrook - Kathryn holdings: MV = Projected Remaining Distribution.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const FIRM = "Greybrook - Kathryn";
const CUR = "CAD";
const DATE = new Date("2026-04-23T00:00:00Z");
const ACCT = "RRSP";

const rows = [
  { symbol: "GBK-STOUFF3",  name: "Greybrook - Stouffville III",   remaining: 20188 },
  { symbol: "GBK-BOWMAN3",  name: "Greybrook - Bowmanville III",   remaining: 7540  },
  { symbol: "GBK-KIPLING",  name: "Greybrook - Kipling Station",   remaining: 14721 },
];

const del = await prisma.transaction.deleteMany({ where: { firm: FIRM } });
console.log(`Deleted ${del.count} existing ${FIRM} transactions.`);

for (const r of rows) {
  await prisma.symbolMeta.upsert({
    where: { symbol: r.symbol },
    update: { manualPrice: r.remaining, manualPriceCurrency: CUR },
    create: { symbol: r.symbol, manualPrice: r.remaining, manualPriceCurrency: CUR },
  });
  await prisma.transaction.create({
    data: {
      symbol: r.symbol, name: r.name, assetType: "STOCK", action: "BUY",
      quantity: 1, price: 0, fees: 0, currency: CUR,
      account: ACCT, firm: FIRM, accountNumber: null, orderType: "MARKET",
      executedAt: DATE,
      notes: "Greybrook holding. Market value = projected remaining distribution.",
    },
  });
  console.log(`${r.symbol}: remaining distribution $${r.remaining.toLocaleString()}`);
}

await prisma.$disconnect();
