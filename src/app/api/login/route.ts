import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  rateLimitCheck,
  rateLimitRecordFailure,
  rateLimitReset,
  signSession,
  verifyCredentials,
} from "@/lib/auth";

export const runtime = "nodejs";

function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);

  const limit = rateLimitCheck(ip);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSec) },
      },
    );
  }

  let username = "";
  let password = "";
  const contentType = req.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      const body = await req.json();
      username = String(body?.username ?? "");
      password = String(body?.password ?? "");
    } else {
      const form = await req.formData();
      username = String(form.get("username") ?? "");
      password = String(form.get("password") ?? "");
    }
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const ok = await verifyCredentials(username, password);
  if (!ok) {
    rateLimitRecordFailure(ip);
    return NextResponse.json(
      { error: "Invalid username or password" },
      { status: 401 },
    );
  }

  const token = await signSession(username);
  if (!token) {
    return NextResponse.json(
      { error: "Authentication is not configured on the server" },
      { status: 500 },
    );
  }

  rateLimitReset(ip);

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}
