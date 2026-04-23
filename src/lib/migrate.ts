import { prisma } from "./prisma";

// One-shot migration from the legacy Holding table to Transaction.
// Runs at most once per process. If there are any transactions or no holdings,
// this is a no-op.
let migrated = false;
let migrating: Promise<void> | null = null;

export async function ensureMigrated(): Promise<void> {
  if (migrated) return;
  if (migrating) return migrating;
  migrating = (async () => {
    const [txCount, holdings] = await Promise.all([
      prisma.transaction.count(),
      prisma.holding.findMany(),
    ]);
    if (txCount === 0 && holdings.length > 0) {
      await prisma.$transaction(
        holdings.map((h) =>
          prisma.transaction.create({
            data: {
              symbol: h.symbol,
              name: h.name,
              assetType: h.assetType,
              action: "BUY",
              quantity: h.quantity,
              price: h.quantity > 0 ? h.costBasis / h.quantity : 0,
              fees: 0,
              currency: h.currency,
              executedAt: h.purchaseDate ?? h.createdAt,
              notes: h.notes,
              orderType: null,
              account: null,
            },
          }),
        ),
      );
      console.log(`[migrate] Copied ${holdings.length} holdings → transactions`);
    }
    migrated = true;
  })();
  return migrating;
}
