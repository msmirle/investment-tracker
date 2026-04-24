// Revert reset-greybrook: restore prior Greybrook - Michael state.
// Prior state: 6 opening BUY transactions (book = Invested Capital, MV = PTR
// with Colgan reduced by $50k) + a $50k DIST on GB-COLGAN.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const FIRM = "Greybrook - Michael";
const CUR = "CAD";
const DATE = new Date("2026-04-23T00:00:00Z");
const ACCT = "RRSP";

const positions = [
  { symbol: "GB-STOUFF3",   name: "Greybrook - Stouffville III",        book: 17000, mv: 20188  },
  { symbol: "GB-COLGAN",    name: "Greybrook - Colgan",                 book: 50000, mv: 322500 },
  { symbol: "GB-YONGEEG",   name: "Greybrook - Yonge and Eglinton",     book: 20000, mv: 47000  },
  { symbol: "GB-KIPLING",   name: "Greybrook - Kipling Station",        book: 8000,  mv: 14721  },
  { symbol: "GB-MARKHAM",   name: "Greybrook - Markham Road and Major", book: 75000, mv: 206250 },
  { symbol: "GB-BRANTFORD", name: "Greybrook - Brantford",              book: 40000, mv: 150816 },
];

const del = await prisma.transaction.deleteMany({ where: { firm: FIRM } });
console.log(`Deleted ${del.count} existing Greybrook - Michael transactions.`);

for (const p of positions) {
  await prisma.symbolMeta.upsert({
    where: { symbol: p.symbol },
    update: { manualPrice: p.mv, manualPriceCurrency: CUR },
    create: { symbol: p.symbol, manualPrice: p.mv, manualPriceCurrency: CUR },
  });
  await prisma.transaction.create({
    data: {
      symbol: p.symbol, name: p.name, assetType: "STOCK", action: "BUY",
      quantity: 1, price: p.book, fees: 0, currency: CUR,
      account: ACCT, firm: FIRM, accountNumber: null, orderType: "MARKET",
      executedAt: DATE,
      notes: "Greybrook private real-estate position as of Apr 23 2026.",
    },
  });
}

// $50k realized distribution on GB-COLGAN.
await prisma.transaction.create({
  data: {
    symbol: "GB-COLGAN", name: "Greybrook - Colgan", assetType: "STOCK", action: "DIST",
    quantity: 1, price: 50000, fees: 0, currency: CUR,
    account: ACCT, firm: FIRM, accountNumber: null, orderType: null,
    executedAt: new Date("2026-04-23T12:00:00Z"),
    notes: "Realized distribution (Projected Total Return reduction offset).",
  },
});

console.log("Restored prior Greybrook - Michael state.");
await prisma.$disconnect();
