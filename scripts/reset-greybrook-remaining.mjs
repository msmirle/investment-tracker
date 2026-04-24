// Wipe Greybrook - Michael and re-add with MV = Projected Remaining Distribution.
// Book = 0 (no invested capital tracked), no realized gains.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const FIRM = "Greybrook - Michael";
const CUR = "CAD";
const DATE = new Date("2026-04-23T00:00:00Z");
const ACCT = "RRSP";

const rows = [
  { symbol: "GB-STOUFF3",   name: "Greybrook - Stouffville III",        remaining: 20188  },
  { symbol: "GB-COLGAN",    name: "Greybrook - Colgan",                 remaining: 169628 },
  { symbol: "GB-YONGEEG",   name: "Greybrook - Yonge and Eglinton",     remaining: 47000  },
  { symbol: "GB-KIPLING",   name: "Greybrook - Kipling Station",        remaining: 14721  },
  { symbol: "GB-MARKHAM",   name: "Greybrook - Markham Road and Major", remaining: 206250 },
  { symbol: "GB-BRANTFORD", name: "Greybrook - Brantford",              remaining: 150816 },
];

const del = await prisma.transaction.deleteMany({ where: { firm: FIRM } });
console.log(`Deleted ${del.count} existing Greybrook - Michael transactions.`);

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
