import { NextResponse } from "next/server";
import OpenAI, { AzureOpenAI } from "openai";
import { prisma } from "@/lib/prisma";
import { ensureMigrated } from "@/lib/migrate";
import { aggregateTransactions } from "@/lib/positions";
import { evaluatePositions } from "@/lib/positions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const MODEL = process.env.OPENAI_MODEL || "gpt-4o";

function getClient(): { client: OpenAI | AzureOpenAI; model: string } | { error: string } {
  const azEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const azKey = process.env.AZURE_OPENAI_API_KEY;
  const azDeployment = process.env.AZURE_OPENAI_DEPLOYMENT || MODEL;
  const azApiVersion = process.env.AZURE_OPENAI_API_VERSION || "2025-03-01-preview";
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
      "No AI credentials configured. Set AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_API_KEY, or OPENAI_API_KEY.",
  };
}

const SYSTEM_PROMPT = `You are a thoughtful, balanced virtual investment advisor
analyzing a real portfolio for a Canadian retail investor. You are NOT a
licensed financial advisor — make that disclaimer clear at the end.

Produce your analysis in well-structured Markdown with the following sections,
in this order, using ## headings:

## Portfolio Snapshot
A brief 3-5 bullet overview: total market value, number of positions,
concentration, currency mix, asset-class mix, largest and smallest positions.

## What's Going Well
Concrete strengths grounded in the actual holdings and recent performance.

## What Could Be Better
Concrete weaknesses, risks, or inefficiencies (concentration, tax drag,
currency risk, sector gaps, underperformers, fee drag on mutual funds, etc.).

## Balance & Diversification
Your take on the overall balance: equity vs. fixed income vs. alternatives,
geographic mix, sector mix, currency exposure, CAD vs USD tilt.

## Macro Context
A SHORT, dated-as-of-today perspective on macro, geopolitical, and Canadian
trends that are most relevant to THIS portfolio. Be specific about which
holdings are affected and how. Avoid generic boilerplate.

## Recommended Changes
A prioritized, numbered list of concrete actions the investor could consider.
Each item: 1) what to do, 2) why, 3) how big/urgent. Prefer actions that are
tax-aware for Canadian accounts (TFSA, RRSP, non-registered). Do NOT recommend
specific buy/sell prices.

## Disclaimer
A one-paragraph disclaimer that this is general information, not personalized
financial advice, and recommends speaking with a licensed advisor.

Rules:
- Base every observation on the data provided. If something isn't in the data,
  don't assume it.
- Keep it concise — aim for a useful page of reading, not a wall of text.
- Reference specific symbols and firms when relevant.
- Use today's date as the "as of" date for macro commentary.`;

interface PortfolioHolding {
  symbol: string;
  name: string;
  assetType: string;
  quantity: number;
  firm: string | null;
  accountNumber: string | null;
  costCurrency: string;
  priceCurrency: string | null;
  costBasis: number;
  bookValue: number;
  marketValue: number | null;
  gain: number | null;
  gainPct: number | null;
  realizedGain: number;
  dayChangePct?: number | null;
}

export async function POST(req: Request) {
  const got = getClient();
  if ("error" in got) {
    return NextResponse.json({ error: got.error }, { status: 500 });
  }
  const { client, model } = got;
  await ensureMigrated();

  const body = (await req.json().catch(() => ({}))) as { currency?: string };
  const displayCurrency = (body.currency || "CAD").toUpperCase();

  const txs = await prisma.transaction.findMany({
    orderBy: [{ executedAt: "desc" }],
    take: 500,
  });
  const positions = aggregateTransactions(txs);
  const evaluated = await evaluatePositions(positions, displayCurrency);

  const holdings: PortfolioHolding[] = evaluated.map((p) => ({
    symbol: p.symbol,
    name: p.name,
    assetType: p.assetType,
    quantity: Number(p.quantity.toFixed(6)),
    firm: p.firm,
    accountNumber: p.accountNumber,
    costCurrency: p.costCurrency,
    priceCurrency: p.priceCurrency,
    costBasis: round(p.costBasis),
    bookValue: round(p.bookValue),
    marketValue: p.marketValue !== null ? round(p.marketValue) : null,
    gain: p.gain !== null ? round(p.gain) : null,
    gainPct: p.gainPct !== null ? Number(p.gainPct.toFixed(2)) : null,
    realizedGain: round(p.realizedGain),
    dayChangePct:
      (p as unknown as { dayChangePct?: number | null }).dayChangePct != null
        ? Number(((p as unknown as { dayChangePct: number }).dayChangePct).toFixed(2))
        : null,
  }));

  const totalMv = holdings.reduce((s, h) => s + (h.marketValue ?? 0), 0);
  const totalBook = holdings.reduce((s, h) => s + h.bookValue, 0);

  const dataBlock = {
    asOf: new Date().toISOString().slice(0, 10),
    displayCurrency,
    totalMarketValue: round(totalMv),
    totalBookValue: round(totalBook),
    unrealizedGain: round(totalMv - totalBook),
    holdings,
    recentTransactions: txs.slice(0, 40).map((t) => ({
      date: new Date(t.executedAt).toISOString().slice(0, 10),
      symbol: t.symbol,
      action: t.action,
      quantity: t.quantity,
      price: t.price,
      currency: t.currency,
      firm: t.firm,
    })),
  };

  try {
    const resp = await client.responses.create({
      model,
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Analyze the following portfolio. Today's date is ${dataBlock.asOf}. All values are in ${displayCurrency} unless labeled otherwise.\n\nPORTFOLIO_JSON:\n${JSON.stringify(dataBlock, null, 2)}`,
            },
          ],
        },
      ],
    });
    const text = resp.output_text;
    if (!text) throw new Error("Model returned no text");
    return NextResponse.json({
      analysis: text,
      asOf: dataBlock.asOf,
      totalMarketValue: dataBlock.totalMarketValue,
      displayCurrency,
      holdingsCount: holdings.length,
    });
  } catch (err) {
    console.error("[advisor] model error", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
