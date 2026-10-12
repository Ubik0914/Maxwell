import { type NextRequest } from "next/server";
import { getContainer } from "@/mail/server/container";
import { workerFor } from "@/mail/server/worker";

export const runtime = "nodejs";
// 1回の同期は短い（history の差分だけ）。間に合わなければ 503 で Pub/Sub が再送する
export const maxDuration = 60;

/** Gmail watch → Pub/Sub push の受け口。Google の OIDC トークンで検証する（ログインは使わない） */
export async function POST(req: NextRequest) {
  let c;
  try {
    c = getContainer();
  } catch {
    // メールの環境変数が未設定：Pub/Sub には再送させる
    return new Response(null, { status: 503 });
  }
  const r = await workerFor(c).pubsub(req.headers.get("authorization"), await req.text());
  return r.body === undefined ? new Response(null, { status: r.status }) : Response.json(r.body, { status: r.status });
}
