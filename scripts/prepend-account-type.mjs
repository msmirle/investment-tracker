import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const txs = await prisma.transaction.findMany();
let n = 0;
for (const t of txs) {
  if (!t.account || !t.accountNumber) continue;
  const m1 = t.account.match(/·\s*([A-Za-z]+)\s*-/);
  const m2 = t.account.match(/^(?:Investia|Questrade)\s+([A-Za-z]+)$/);
  const type = (m1 && m1[1]) || (m2 && m2[1]) || null;
  if (!type) continue;
  if (t.accountNumber.startsWith(type + " ")) continue;
  const newNum = `${type} - ${t.accountNumber}`;
  await prisma.transaction.update({ where: { id: t.id }, data: { accountNumber: newNum } });
  n++;
  console.log(t.symbol, "→", newNum);
}
console.log("Updated", n);
await prisma.$disconnect();
