import "server-only";
import type { NextRequest } from "next/server";
import type { Container } from "./container";

/**
 * メールの利用者＝Maxwell にログインしている Supabase のユーザー。
 * メール側は独自のログイン・セッションを持たない（Cookie は Supabase のもの）。
 * Gmail の接続は、このユーザーに紐づけて mail.mail_accounts に保存する。
 */
export interface Session {
  userId: string;
  email: string;
}

export interface AuthUser {
  id: string;
  email: string;
}

/** 現在の利用者を返す境界。本番は Supabase（Cookie または Bearer）、テストは差し替える */
export interface AuthPort {
  currentUser(req?: NextRequest): Promise<AuthUser | null>;
}

export async function getSession(c: Container, req?: NextRequest): Promise<Session | null> {
  const user = await c.auth.currentUser(req);
  if (!user?.email) return null;
  const u = await c.repos.users.ensure(user.id, user.email);
  return { userId: u.id, email: u.email };
}
