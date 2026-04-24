// Record a $50,000 realized distribution for GB-COLGAN under Greybrook - Michael.
// Uses action="DIST" which positions.ts treats as realized proceeds only
// (no impact on quantity or cost basis).
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

await prisma.transaction.create({
  data: {
    symbol: "GB-COLGAN",
    name: "Greybrook - Colgan",
    assetType: "STOCK",
    action: "DIST",
    quantity: 1,
    price: 50000,
    fees: 0,
    currency: "CAD",
    account: "RRSP",
    firm: "Greybrook - Michael",
    accountNumber: null,
    orderType: null,
    executedAt: new Date("2026-04-23T12:00:00Z"),
    notes: "Realized distribution (Projected Total Return reduction offset).",
  },
});

console.log("Recorded $50,000 realized distribution for GB-COLGAN.");

await prisma.$disconnect();
