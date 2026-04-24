import { NextResponse } from "next/server";
import OpenAI, { AzureOpenAI } from "openai";
import { prisma } from "@/lib/prisma";
import { ensureMigrated } from "@/lib/migrate";
import { aggregateTransactions, evaluatePositions } from "@/lib/positions";

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
  return { error: "No AI credentials configured." };
}

const SYSTEM_PROMPT = `You are a thoughtful, balanced virtual investment
advisor. Continue the conversation with the user about their portfolio, which
was shared in the initial analysis. Ground every answer in the portfolio data
and their prior analysis. Be concise and specific. Reference actual holdings
and firms where relevant. You are not a licensed financial advisor; remind the
user of this where appropriate. Format replies in Markdown.`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function POST(req: Request) {
  const got = getClient();
  if ("error" in got) return NextResponse.json({ error: got.error }, { status: 500 });
  const { client, model } = got;
  await ensureMigrated();

  const body = (await req.json().catch(() => ({}))) as {
    currency?: string;
    priorAnalysis?: string;
    messages?: ChatMessage[];
  };
  const displayCurrency = (body.currency || "CAD").toUpperCase();
  const priorAnalysis = body.priorAnalysis || "";
  const history = Array.isArray(body.messages) ? body.messages : [];
  if (history.length === 0 || history[history.length - 1].role !== "user") {
    return NextResponse.json({ error: "Last message must be from user" }, { status: 400 });
  }

  // Rebuild a compact portfolio snapshot to ground the model.
  const txs = await prisma.transaction.findMany({
    orderBy: [{ executedAt: "desc" }],
    take: 500,
  });
  const positions = aggregateTransactions(txs);
  const evaluated = await evaluatePositions(positions, displayCurrency);
  const holdings = evaluated.map((p) => ({
    symbol: p.symbol,
    name: p.name,
    assetType: p.assetType,
    quantity: Number(p.quantity.toFixed(6)),
    firm: p.firm,
    costCurrency: p.costCurrency,
    bookValue: round(p.bookValue),
    marketValue: p.marketValue !== null ? round(p.marketValue) : null,
    gainPct: p.gainPct !== null ? Number(p.gainPct.toFixed(2)) : null,
  }));
  const totalMv = holdings.reduce((s, h) => s + (h.marketValue ?? 0), 0);

  const portfolioContext = {
    asOf: new Date().toISOString().slice(0, 10),
    displayCurrency,
    totalMarketValue: round(totalMv),
    holdings,
  };

  const input: Array<
    | { role: "system"; content: string }
    | { role: "user" | "assistant"; content: string }
  > = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "system",
      content:
        `PORTFOLIO_CONTEXT (today=${portfolioContext.asOf}, ${displayCurrency}):\n` +
        JSON.stringify(portfolioContext, null, 2),
    },
  ];
  if (priorAnalysis) {
    input.push({
      role: "assistant",
      content: priorAnalysis,
    });
  }
  for (const m of history) {
    input.push({ role: m.role, content: m.content });
  }

  try {
    const resp = await client.responses.create({
      model,
      input,
    });
    const text = resp.output_text;
    if (!text) throw new Error("Model returned no text");
    return NextResponse.json({ reply: text });
  } catch (err) {
    console.error("[advisor/chat] model error", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
