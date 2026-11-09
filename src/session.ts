/**
 * Session-Handling: zufaelliges Token (nur als SHA-256-Hash in D1), Cookidoo-Cookies
 * AES-GCM-verschluesselt. Das Cookidoo-Passwort wird NICHT gespeichert; laeuft die
 * Cookidoo-Session ab, muss sich der Nutzer neu einloggen.
 */
import type { Context, MiddlewareHandler } from "hono";
import type { AppVars, Env } from "./env";

const SESSION_TTL_MS = 14 * 24 * 3600 * 1000;
const enc = new TextEncoder();
const dec = new TextDecoder();

const toHex = (b: ArrayBuffer | Uint8Array): string =>
  [...new Uint8Array(b instanceof Uint8Array ? b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) : b)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");

export async function sha256Hex(s: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}

async function aesKey(secret: string): Promise<CryptoKey> {
  if (!secret || secret.length < 16) throw new Error("SESSION_KEY fehlt oder ist zu kurz (min. 16 Zeichen)");
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encrypt(secret: string, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(secret), enc.encode(plain));
  return `${btoa(String.fromCharCode(...iv))}.${btoa(String.fromCharCode(...new Uint8Array(ct)))}`;
}

export async function decrypt(secret: string, payload: string): Promise<string> {
  const [ivB64, ctB64] = payload.split(".");
  const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
  const ct = Uint8Array.from(atob(ctB64), (c) => c.charCodeAt(0));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await aesKey(secret), ct);
  return dec.decode(pt);
}

export function newToken(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

export async function createSession(
  env: Env,
  data: { cookiesJson: string; country: string; username: string | null },
): Promise<string> {
  const token = newToken();
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO sessions (token_hash, cookies_enc, country, username, created_at, expires_at) VALUES (?,?,?,?,?,?)",
  )
    .bind(
      await sha256Hex(token),
      await encrypt(env.SESSION_KEY, data.cookiesJson),
      data.country,
      data.username,
      now,
      now + SESSION_TTL_MS,
    )
    .run();
  return token;
}

export async function saveCookies(env: Env, tokenHash: string, cookiesJson: string): Promise<void> {
  await env.DB.prepare("UPDATE sessions SET cookies_enc = ? WHERE token_hash = ?")
    .bind(await encrypt(env.SESSION_KEY, cookiesJson), tokenHash)
    .run();
}

export async function deleteSession(env: Env, tokenHash: string): Promise<void> {
  await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
}

export async function purgeExpiredSessions(env: Env): Promise<void> {
  await env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(Date.now()).run();
}

export function bearer(c: Context): string | null {
  const h = c.req.header("Authorization");
  if (h?.toLowerCase().startsWith("bearer ")) return h.slice(7).trim();
  return c.req.header("X-Session") ?? null;
}

/** Middleware: laedt die Session aus D1 und legt sie in c.var.session ab. */
export const requireSession: MiddlewareHandler<{ Bindings: Env; Variables: AppVars }> = async (c, next) => {
  const token = bearer(c);
  if (!token) return c.json({ error: "Nicht eingeloggt" }, 401);
  const tokenHash = await sha256Hex(token);
  const row = await c.env.DB.prepare(
    "SELECT cookies_enc, country, username, expires_at FROM sessions WHERE token_hash = ?",
  )
    .bind(tokenHash)
    .first<{ cookies_enc: string; country: string; username: string | null; expires_at: number }>();
  if (!row || row.expires_at < Date.now()) return c.json({ error: "Unbekannte oder abgelaufene Session" }, 401);
  let cookiesJson: string;
  try {
    cookiesJson = await decrypt(c.env.SESSION_KEY, row.cookies_enc);
  } catch {
    return c.json({ error: "Session ungueltig, bitte neu einloggen" }, 401);
  }
  c.set("session", { tokenHash, country: row.country, username: row.username, cookiesJson });
  await next();
};
