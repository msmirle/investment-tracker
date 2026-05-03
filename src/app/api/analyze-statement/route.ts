import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/migrate";
import {
  buildAnalysisOutput,
  createAnalysisSession,
  type ExtractionResult,
} from "@/lib/statement-analysis";
import {
  STATEMENT_JSON_SCHEMA,
  STATEMENT_SYSTEM_PROMPT,
  getStatementClient,
} from "@/lib/statement-ai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// PDFs can be a few MB; give the model plenty of time.
export const maxDuration = 120;

export async function POST(req: Request) {
  const got = getStatementClient();
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
  const filename =
    "filename" in file && typeof (file as File).name === "string"
      ? (file as File).name
      : "statement";
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 20 MB)" }, { status: 400 });
  }

  const instructions = String(form.get("instructions") ?? "").trim();

  const fileType = (file as File).type || "";
  const lowerName = filename.toLowerCase();
  const isImage =
    fileType.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(lowerName);
  const isPdf = fileType === "application/pdf" || lowerName.endsWith(".pdf");
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

  const baseText = isImage
    ? "Extract all transactions and distributions visible in this screenshot of a statement."
    : "Extract all transactions and distributions from this statement.";
  const userText = instructions
    ? `${baseText}\n\nSpecial instructions from the user:\n${instructions}`
    : baseText;

  const userContent: Array<
    | { type: "input_text"; text: string }
    | { type: "input_file"; filename: string; file_data: string }
    | { type: "input_image"; image_url: string; detail: "auto" | "low" | "high" }
  > = [
    { type: "input_text", text: userText },
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
  let responseId: string;
  try {
    const resp = await client.responses.create({
      model,
      input: [
        { role: "system", content: STATEMENT_SYSTEM_PROMPT },
        { role: "user", content: userContent },
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
    console.error("[analyze-statement] model error", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  const output = await buildAnalysisOutput(parsed);
  const analysisId = createAnalysisSession(responseId);

  return NextResponse.json({ ...output, analysisId });
}
