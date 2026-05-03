import bcrypt from "bcryptjs";

// ---------------------------------------------------------------------------
// Configuration loaded from environment variables.
//
// All three MUST be set at runtime. If any is missing or empty the auth
// helpers refuse to authenticate anyone — i.e. the app fails closed instead
// of silently allowing access.
//
// NOTE: This module is imported from the Next.js middleware, which runs on
// the Edge runtime. That means we MUST NOT use Node's `crypto` module here.
// We use the Web Crypto API (`crypto.subtle`) instead, which is available
// in both Edge and Node runtimes.
// ---------------------------------------------------------------------------

const AUTH_USERNAME = process.env.AUTH_USERNAME ?? "";
const AUTH_PASSWORD_HASH = process.env.AUTH_PASSWORD_HASH ?? "";
const AUTH_SESSION_SECRET = process.env.AUTH_SESSION_SECRET ?? "";

export const AUTH_COOKIE_NAME = "it_auth";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

let warnedAboutMissingConfig = false;
function authConfigured(): boolean {
  const ok =
    AUTH_USERNAME.length > 0 &&
    AUTH_PASSWORD_HASH.length > 0 &&
    AUTH_SESSION_SECRET.length >= 32;
  if (!ok && !warnedAboutMissingConfig) {
    warnedAboutMissingConfig = true;
    // eslint-disable-next-line no-console
    console.error(
      "[auth] AUTH_USERNAME / AUTH_PASSWORD_HASH / AUTH_SESSION_SECRET are not all set. " +
        "All authentication will be refused until they are configured.",
    );
  }
  return ok;
}

// ---------------------------------------------------------------------------
// Password verification (bcrypt). Only invoked from Node-runtime API routes.
// ---------------------------------------------------------------------------

export async function verifyCredentials(
  username: string,
  password: string,
): Promise<boolean> {
  if (!authConfigured()) return false;
  if (typeof username !== "string" || typeof password !== "string") return false;
  if (!constantTimeStringEquals(username, AUTH_USERNAME)) {
    // Run bcrypt against the real hash anyway to avoid leaking, via timing,
    // whether the username was right.
    try {
      await bcrypt.compare(password, AUTH_PASSWORD_HASH);
    } catch {
      /* ignore */
    }
    return false;
  }
  try {
    return await bcrypt.compare(password, AUTH_PASSWORD_HASH);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Signed session cookie (Web Crypto / HMAC-SHA256).
//
// Format: b64u(username) "." b64u(expiryUnixSeconds) "." b64u(hmacSha256)
// where the HMAC covers "<b64u-username>.<b64u-expiry>".
// ---------------------------------------------------------------------------

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

let cachedKeyPromise: Promise<CryptoKey> | null = null;
function getHmacKey(): Promise<CryptoKey> {
  if (!cachedKeyPromise) {
    cachedKeyPromise = crypto.subtle.importKey(
      "raw",
      textEncoder.encode(AUTH_SESSION_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
  }
  return cachedKeyPromise;
}

async function hmac(payload: string): Promise<Uint8Array> {
  const key = await getHmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, textEncoder.encode(payload));
  return new Uint8Array(sig);
}

function b64u(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? textEncoder.encode(input) : input;
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64uDecode(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const bin = atob(input.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64uDecodeToString(input: string): string {
  return textDecoder.decode(b64uDecode(input));
}

export async function signSession(username: string): Promise<string | null> {
  if (!authConfigured()) return null;
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const u = b64u(username);
  const e = b64u(String(exp));
  const sig = b64u(await hmac(`${u}.${e}`));
  return `${u}.${e}.${sig}`;
}

export async function verifySession(
  cookieValue: string | undefined | null,
): Promise<boolean> {
  if (!authConfigured()) return false;
  if (!cookieValue || typeof cookieValue !== "string") return false;
  const parts = cookieValue.split(".");
  if (parts.length !== 3) return false;
  const [u, e, sig] = parts;

  let expected: Uint8Array;
  let provided: Uint8Array;
  try {
    expected = await hmac(`${u}.${e}`);
    provided = b64uDecode(sig);
  } catch {
    return false;
  }
  if (!constantTimeBytesEqual(provided, expected)) return false;

  // Username binding: rotating AUTH_USERNAME also invalidates old cookies.
  let username: string;
  try {
    username = b64uDecodeToString(u);
  } catch {
    return false;
  }
  if (!constantTimeStringEquals(username, AUTH_USERNAME)) return false;

  // Expiry check.
  let expSec: number;
  try {
    expSec = parseInt(b64uDecodeToString(e), 10);
  } catch {
    return false;
  }
  if (!Number.isFinite(expSec)) return false;
  if (expSec <= Math.floor(Date.now() / 1000)) return false;

  return true;
}

function constantTimeBytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
}

function constantTimeStringEquals(a: string, b: string): boolean {
  return constantTimeBytesEqual(textEncoder.encode(a), textEncoder.encode(b));
}

// ---------------------------------------------------------------------------
// In-memory login rate limiter.
//
// Sliding window: max 10 failed attempts per IP per 15 minutes. Successful
// logins clear the bucket. Single-process only — fine for one container.
// Only invoked from the Node-runtime login route.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

type Bucket = { times: number[] };
const buckets = new Map<string, Bucket>();

export function rateLimitCheck(ip: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const b = buckets.get(ip) ?? { times: [] };
  b.times = b.times.filter((t) => t > cutoff);
  if (b.times.length >= RATE_LIMIT_MAX) {
    const retryMs = Math.max(0, b.times[0] + RATE_LIMIT_WINDOW_MS - now);
    buckets.set(ip, b);
    return { allowed: false, retryAfterSec: Math.ceil(retryMs / 1000) };
  }
  buckets.set(ip, b);
  return { allowed: true, retryAfterSec: 0 };
}

export function rateLimitRecordFailure(ip: string): void {
  const b = buckets.get(ip) ?? { times: [] };
  b.times.push(Date.now());
  buckets.set(ip, b);
}

export function rateLimitReset(ip: string): void {
  buckets.delete(ip);
}
