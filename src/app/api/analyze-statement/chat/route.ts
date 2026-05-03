import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/migrate";
import {
  buildAnalysisOutput,
  getAnalysisSession,
  updateAnalysisSession,
  type ExtractionResult,
} from "@/lib/statement-analysis";
import {
  STATEMENT_JSON_SCHEMA,
  STATEMENT_SYSTEM_PROMPT,
  getStatementClient,
} from "@/lib/statement-ai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const got = getStatementClient();
  if ("error" in got) {
    return NextResponse.json({ error: got.error }, { status: 500 });
  }
  const { client, model } = got;
  await ensureMigrated();

  let body: { analysisId?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const analysisId = String(body.analysisId ?? "").trim();
  const message = String(body.message ?? "").trim();
  if (!analysisId || !message) {
    return NextResponse.json(
      { error: "Missing analysisId or message" },
      { status: 400 },
    );
  }

  const session = getAnalysisSession(analysisId);
  if (!session) {
    return NextResponse.json(
      {
        error:
          "Analysis session expired. Please re-upload the statement to start over.",
      },
      { status: 410 },
    );
  }

  let parsed: ExtractionResult;
  let responseId: string;
  try {
    const resp = await client.responses.create({
      model,
      previous_response_id: session.previousResponseId,
      input: [
        { role: "system", content: STATEMENT_SYSTEM_PROMPT },
        { role: "user", content: message },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "statement_extraction",
          schema: STATEMENT_JSON_SCHEMA,
          strict: true,
        },
      },
    });
    const text = resp.output_text;
    if (!text) throw new Error("Model returned no text");
    parsed = JSON.parse(text) as ExtractionResult;
    responseId = resp.id;
  } catch (err) {
    console.error("[analyze-statement/chat] model error", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  const output = await buildAnalysisOutput(parsed);
  updateAnalysisSession(analysisId, responseId);

  return NextResponse.json({ ...output, analysisId });
}
