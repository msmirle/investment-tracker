import { NextResponse } from "next/server";
import OpenAI, { AzureOpenAI } from "openai";
import { prisma } from "@/lib/prisma";
import { ensureMigrated } from "@/lib/migrate";
import { aggregateTransactions, type TransactionRow } from "@/lib/positions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// PDFs can be a few MB; give the model plenty of time.
export const maxDuration = 120;

const MODEL = process.env.OPENAI_MODEL || "gpt-4o";

function getClient(): { client: OpenAI | AzureOpenAI; model: string } | { error: string } {
  const azEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const azKey = process.env.AZURE_OPENAI_API_KEY;
  const azDeployment = process.env.AZURE_OPENAI_DEPLOYMENT || MODEL;
  const azApiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-10-21";
  if (azEndpoint && azKey) {
    return {
      client: new AzureOpenAI({
        endpoint: azEndpoint,
        apiKey: azKey,
        apiVersion: azApiVersion,
        deployment: azDeployment,
      }),
      model: azDeployment,
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return { client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }), model: MODEL };
  }
  return {
    error:
      "No AI credentials configured. Set AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_API_KEY (and optionally AZURE_OPENAI_DEPLOYMENT), or OPENAI_API_KEY.",
  };
}

interface ExtractedTx {
  symbol: string;
  name?: string | null;
  assetType: "STOCK" | "ETF" | "CRYPTO" | "MUTUAL_FUND";
  action: "BUY" | "SELL" | "DIST";
  quantity: number;
  price: number;
  fees?: number | null;
  currency: string;
  firm?: string | null;
  accountNumber?: string | null;
  executedAt: string; // YYYY-MM-DD
  notes?: string | null;
}

interface ExtractionResult {
  statementSummary: string;
  transactions: ExtractedTx[];
}

const SYSTEM_PROMPT = `You are a financial-statement parser. Given a brokerage or
fund statement (monthly, quarterly, or transaction), extract every individual
trade or distribution as a structured transaction.

Rules:
- action = BUY for purchases, SELL for dispositions, DIST for
  distributions/dividends/interest paid out (not reinvested). For DRIP /
  reinvested distributions that add shares, use BUY.
- quantity is always positive.
- price is per-unit in the transaction currency. For DIST, price is the total
  cash amount and quantity is 1.
- currency is the 3-letter ISO code (USD, CAD, etc.).
- firm is the brokerage/bank name (e.g. "Questrade", "Fidelity", "TD Direct").
- accountNumber is the account number shown on the statement if present.
- executedAt must be an ISO date (YYYY-MM-DD).
- Infer assetType: STOCK for equities, ETF for ETFs, CRYPTO for crypto,
  MUTUAL_FUND for open-ended mutual funds (FundServ codes).
- Include ONLY trades and distributions. Ignore interest charges, fees, cash
  deposits, cash withdrawals, wire transfers, and account opening/closing
  activity.
- Do NOT fabricate transactions. If a value is not present, omit optional
  fields.
- statementSummary: one short sentence describing the statement (firm, account,
  period).`;

const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["statementSummary", "transactions"],
  properties: {
    statementSummary: { type: "string" },
    transactions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "symbol",
          "name",
          "assetType",
          "action",
          "quantity",
          "price",
          "fees",
          "currency",
          "firm",
          "accountNumber",
          "executedAt",
          "notes",
        ],
        properties: {
          symbol: { type: "string" },
          name: { type: ["string", "null"] },
          assetType: { enum: ["STOCK", "ETF", "CRYPTO", "MUTUAL_FUND", "PRIVATE_EQUITY"] },
          action: { enum: ["BUY", "SELL", "DIST"] },
          quantity: { type: "number" },
          price: { type: "number" },
          fees: { type: ["number", "null"] },
          currency: { type: "string" },
          firm: { type: ["string", "null"] },
          accountNumber: { type: ["string", "null"] },
          executedAt: { type: "string" },
          notes: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

function sameDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

function normalize(tx: ExtractedTx) {
  return {
    symbol: (tx.symbol || "").toUpperCase().trim(),
    name: tx.name?.trim() || null,
    assetType: tx.assetType,
    action: tx.action,
    quantity: Number(tx.quantity) || 0,
    price: Number(tx.price) || 0,
    fees: tx.fees != null && isFinite(Number(tx.fees)) ? Number(tx.fees) : 0,
    currency: (tx.currency || "USD").toUpperCase().trim(),
    firm: tx.firm?.trim() || null,
    accountNumber: tx.accountNumber?.trim() || null,
    executedAt: new Date(tx.executedAt),
    notes: tx.notes?.trim() || null,
  };
}

export async function POST(req: Request) {
  const got = getClient();
  if ("error" in got) {
    return NextResponse.json({ error: got.error }, { status: 500 });
  }
  const { client, model } = got;
  await ensureMigrated();

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing 'file' field" }, { status: 400 });
  }
  const filename = "filename" in file && typeof (file as File).name === "string" ? (file as File).name : "statement";
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 20 MB)" }, { status: 400 });
  }

  const fileType = (file as File).type || "";
  const lowerName = filename.toLowerCase();
  const isImage =
    fileType.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif)$/i.test(lowerName);
  const isPdf =
    fileType === "application/pdf" || lowerName.endsWith(".pdf");
  if (!isImage && !isPdf) {
    return NextResponse.json(
      { error: "Unsupported file type. Upload a PDF or an image (PNG/JPG/WebP/GIF)." },
      { status: 400 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const base64 = bytes.toString("base64");
  const mime = isPdf
    ? "application/pdf"
    : fileType.startsWith("image/")
      ? fileType
      : lowerName.endsWith(".png")
        ? "image/png"
        : lowerName.endsWith(".webp")
          ? "image/webp"
          : lowerName.endsWith(".gif")
            ? "image/gif"
            : "image/jpeg";

  const userContent: Array<
    | { type: "input_text"; text: string }
    | { type: "input_file"; filename: string; file_data: string }
    | { type: "input_image"; image_url: string; detail: "auto" | "low" | "high" }
  > = [
    {
      type: "input_text",
      text: isImage
        ? "Extract all transactions and distributions visible in this screenshot of a statement."
        : "Extract all transactions and distributions from this statement.",
    },
    isImage
      ? {
          type: "input_image",
          image_url: `data:${mime};base64,${base64}`,
          detail: "high",
        }
      : {
          type: "input_file",
          filename,
          file_data: `data:application/pdf;base64,${base64}`,
        },
  ];

  let parsed: ExtractionResult;
  try {
    const resp = await client.responses.create({
      model,
      input: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: userContent,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "statement_extraction",
          schema: JSON_SCHEMA,
          strict: true,
        },
      },
    });
    const text = resp.output_text;
    if (!text) throw new Error("Model returned no text");
    parsed = JSON.parse(text) as ExtractionResult;
  } catch (err) {
    console.error("[analyze-statement] model error", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  const extracted = (parsed.transactions || []).map(normalize).filter(
    (t) =>
      t.symbol &&
      isFinite(t.quantity) &&
      t.quantity > 0 &&
      isFinite(t.price) &&
      !isNaN(t.executedAt.getTime()),
  );

  // Identify duplicates against existing transactions. We treat same
  // symbol+action+date+qty+price+firm as an exact duplicate.
  const symbols = Array.from(new Set(extracted.map((t) => t.symbol)));
  const existingDb = symbols.length
    ? await prisma.transaction.findMany({ where: { symbol: { in: symbols } } })
    : [];

  const newTxs: typeof extracted = [];
  const duplicateTxs: typeof extracted = [];
  for (const t of extracted) {
    const dup = existingDb.find(
      (e) =>
        e.symbol.toUpperCase() === t.symbol &&
        e.action.toUpperCase() === t.action &&
        sameDay(new Date(e.executedAt), t.executedAt) &&
        Math.abs(e.quantity - t.quantity) < 1e-6 &&
        Math.abs(e.price - t.price) < 1e-4 &&
        (e.firm ?? null) === t.firm,
    );
    if (dup) duplicateTxs.push(t);
    else newTxs.push(t);
  }

  // Compute before/after position projection for each affected (symbol|firm|acct).
  const allExistingAffected = await prisma.transaction.findMany({
    where: { symbol: { in: symbols } },
  });
  const existingRows: TransactionRow[] = allExistingAffected.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    name: r.name,
    assetType: r.assetType,
    action: r.action,
    quantity: r.quantity,
    price: r.price,
    fees: r.fees,
    currency: r.currency,
    account: r.account,
    firm: r.firm,
    accountNumber: r.accountNumber,
    orderType: r.orderType,
    executedAt: r.executedAt,
    notes: r.notes,
  }));
  const before = aggregateTransactions(existingRows);
  const projectedRows: TransactionRow[] = [
    ...existingRows,
    ...newTxs.map((t, i) => ({
      id: `proposed-${i}`,
      symbol: t.symbol,
      name: t.name,
      assetType: t.assetType,
      action: t.action,
      quantity: t.quantity,
      price: t.price,
      fees: t.fees,
      currency: t.currency,
      account: null,
      firm: t.firm,
      accountNumber: t.accountNumber,
      orderType: null,
      executedAt: t.executedAt,
      notes: t.notes,
    })),
  ];
  const after = aggregateTransactions(projectedRows);

  // Build change list: any position whose (qty, costBasis, realizedGain) changed.
  const changes: Array<{
    key: string;
    symbol: string;
    firm: string | null;
    accountNumber: string | null;
    currency: string;
    beforeQty: number;
    afterQty: number;
    beforeBook: number;
    afterBook: number;
    beforeRealized: number;
    afterRealized: number;
  }> = [];
  const keys = new Set<string>();
  for (const p of before) keys.add(p.key);
  for (const p of after) keys.add(p.key);
  for (const key of keys) {
    const b = before.find((p) => p.key === key);
    const a = after.find((p) => p.key === key);
    const beforeQty = b?.quantity ?? 0;
    const afterQty = a?.quantity ?? 0;
    const beforeBook = b?.costBasis ?? 0;
    const afterBook = a?.costBasis ?? 0;
    const beforeRealized = b?.realizedGain ?? 0;
    const afterRealized = a?.realizedGain ?? 0;
    if (
      Math.abs(beforeQty - afterQty) > 1e-9 ||
      Math.abs(beforeBook - afterBook) > 1e-4 ||
      Math.abs(beforeRealized - afterRealized) > 1e-4
    ) {
      const [symbol, , currency, firm, accountNumber] = key.split("|");
      changes.push({
        key,
        symbol,
        firm: firm || null,
        accountNumber: accountNumber || null,
        currency,
        beforeQty,
        afterQty,
        beforeBook,
        afterBook,
        beforeRealized,
        afterRealized,
      });
    }
  }
  changes.sort((a, b) => a.symbol.localeCompare(b.symbol));

  return NextResponse.json({
    statementSummary: parsed.statementSummary,
    newTransactions: newTxs.map((t) => ({
      ...t,
      executedAt: t.executedAt.toISOString(),
    })),
    duplicateTransactions: duplicateTxs.map((t) => ({
      ...t,
      executedAt: t.executedAt.toISOString(),
    })),
    positionChanges: changes,
  });
}
