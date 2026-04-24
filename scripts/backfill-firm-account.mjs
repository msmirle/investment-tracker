// Backfill firm + accountNumber on existing Transaction rows by parsing `account`.
// Questrade pattern: "Questrade · TFSA - 52033641" → firm=Questrade, number=52033641
// Investia pattern:  "Investia RRSP|LIRA|TFSA"     → firm=Investia, number mapped
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const INVESTIA_ACCOUNT_NUMBERS = {
  RRSP: "317382565",
  LIRA: "317386660",
  TFSA: "317387586",
};

const all = await prisma.transaction.findMany();
let updated = 0;
for (const t of all) {
  if (t.firm && t.accountNumber) continue;
  const acct = (t.account ?? "").trim();
  let firm = null;
  let number = null;

  if (/^Questrade/i.test(acct)) {
    firm = "Questrade";
    const m = acct.match(/-\s*(\d{6,})\s*$/);
    if (m) number = m[1];
  } else if (/^Investia/i.test(acct)) {
    firm = "Investia";
    for (const [kind, num] of Object.entries(INVESTIA_ACCOUNT_NUMBERS)) {
      if (acct.toUpperCase().includes(kind)) {
        number = num;
        break;
      }
    }
  }

  if (firm || number) {
    await prisma.transaction.update({
      where: { id: t.id },
      data: { firm: firm ?? t.firm, accountNumber: number ?? t.accountNumber },
    });
    console.log(`${t.symbol.padEnd(8)} ${acct.padEnd(32)} → firm=${firm} num=${number}`);
    updated++;
  }
}
console.log(`\nUpdated ${updated} / ${all.length} transactions.`);
await prisma.$disconnect();
