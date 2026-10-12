import "server-only";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import type { Container } from "./container";
import { isSecureOrigin } from "./env";

export const SESSION_COOKIE = "syn_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export interface Session {
  userId: string;
  email: string;
}

function key(secret: string) {
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(c: Container, userId: string, sessionVersion: number): Promise<string> {
  return new SignJWT({ sv: sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setAudience("synedge-web")
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(key(c.env.SESSION_SECRET));
}

export function sessionCookieOptions(c: Container) {
  return {
    httpOnly: true,
    secure: isSecureOrigin(c.env),
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

/** セッションを検証する。ユーザーの session_version が変わっていれば無効（ログアウト・接続解除） */
export async function verifySessionToken(c: Container, token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(c.env.SESSION_SECRET), { audience: "synedge-web", algorithms: ["HS256"] });
    if (typeof payload.sub !== "string") return null;
    const user = await c.repos.users.findById(payload.sub);
    if (!user || user.sessionVersion !== payload.sv) return null;
    // 許可リストから外されたユーザーは即時無効
    if (!c.env.ALLOWED_EMAILS.includes(user.email)) return null;
    return { userId: user.id, email: user.email };
  } catch {
    return null;
  }
}

export async function getSession(c: Container): Promise<Session | null> {
  const store = await cookies();
  return verifySessionToken(c, store.get(SESSION_COOKIE)?.value);
}
