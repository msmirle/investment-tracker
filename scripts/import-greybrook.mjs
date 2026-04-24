// Import Greybrook - Michael RRSP private real-estate holdings as of Apr 23 2026.
// MV = Projected Total Return (Colgan reduced by $50k per user instruction).
// Book = Invested Capital.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const FIRM = "Greybrook - Michael";
const CUR = "CAD";
const DATE = new Date("2026-04-23T00:00:00Z");
const ACCT = "RRSP";
const NOTE = "Greybrook private real-estate position as of Apr 23 2026. qty=1 unit, price=invested capital, manualPrice=projected total return.";

const positions = [
  { symbol: "GB-STOUFF3",   name: "Greybrook - Stouffville III",         book: 17000,  mv: 20188  },
  { symbol: "GB-COLGAN",    name: "Greybrook - Colgan",                  book: 50000,  mv: 322500 }, // 372,500 - 50,000
  { symbol: "GB-YONGEEG",   name: "Greybrook - Yonge and Eglinton",      book: 20000,  mv: 47000  },
  { symbol: "GB-KIPLING",   name: "Greybrook - Kipling Station",         book: 8000,   mv: 14721  },
  { symbol: "GB-MARKHAM",   name: "Greybrook - Markham Road and Major",  book: 75000,  mv: 206250 },
  { symbol: "GB-BRANTFORD", name: "Greybrook - Brantford",               book: 40000,  mv: 150816 },
];

for (const p of positions) {
  await prisma.symbolMeta.upsert({
    where: { symbol: p.symbol },
    update: { manualPrice: p.mv, manualPriceCurrency: CUR },
    create: { symbol: p.symbol, manualPrice: p.mv, manualPriceCurrency: CUR },
  });
  await prisma.transaction.create({
    data: {
      symbol: p.symbol,
      name: p.name,
      assetType: "STOCK",
      action: "BUY",
      quantity: 1,
      price: p.book,
      fees: 0,
      currency: CUR,
      account: ACCT,
      firm: FIRM,
      accountNumber: null,
      orderType: "MARKET",
      executedAt: DATE,
      notes: NOTE,
    },
  });
  console.log(`Added ${p.symbol}: book $${p.book.toLocaleString()} → MV $${p.mv.toLocaleString()} CAD`);
}

await prisma.$disconnect();
