// Shared OpenAI / Azure OpenAI client + schema / prompt for the statement
// analyzer endpoints.

import OpenAI, { AzureOpenAI } from "openai";

const FALLBACK_MODEL = process.env.OPENAI_MODEL || "gpt-4o";

export function getStatementClient():
  | { client: OpenAI | AzureOpenAI; model: string }
  | { error: string } {
  const azEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const azKey = process.env.AZURE_OPENAI_API_KEY;
  const azDeployment = process.env.AZURE_OPENAI_DEPLOYMENT || FALLBACK_MODEL;
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
    return {
      client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
      model: FALLBACK_MODEL,
    };
  }
  return {
    error:
      "No AI credentials configured. Set AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_API_KEY (and optionally AZURE_OPENAI_DEPLOYMENT), or OPENAI_API_KEY.",
  };
}

export const STATEMENT_SYSTEM_PROMPT = `You are a financial-statement parser. Given a brokerage or
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
  period).

If the user provided special instructions, follow them exactly. They may ask
you to ignore parts of the statement, treat a position as a specific quantity,
correct apparent typos, etc.

When refining a previous analysis through a conversation, return the FULL
updated transaction list reflecting any requested change. If the user is just
asking a question and no change is needed, return the same transactions you
returned previously.

\`assistantReply\` rules — important:
- It is the ONLY text the user sees this turn. There is no follow-up message,
  no streaming, no second reply. Whatever you want to say must fit in this
  one field.
- Make it self-contained. NEVER write phrases like "Let me detail…",
  "I'll list them below", "see below", or "here is the breakdown" — there is
  no "below". Either include the detail inline or don't promise it.
- For simple confirmations (e.g. "Done — removed the Apr 30 distribution"),
  one or two sentences is ideal.
- When the user asks for details, a list, a comparison, or an explanation,
  include the full content directly in \`assistantReply\`. Use Markdown
  (bullet lists, tables, **bold**) freely; it is rendered for the user.
- Refer to transactions by date + symbol + action + quantity so the user can
  match them against the table.`;

export const STATEMENT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["statementSummary", "transactions", "assistantReply"],
  properties: {
    statementSummary: { type: "string" },
    assistantReply: { type: "string" },
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
          assetType: {
            enum: ["STOCK", "ETF", "CRYPTO", "MUTUAL_FUND", "PRIVATE_EQUITY"],
          },
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
