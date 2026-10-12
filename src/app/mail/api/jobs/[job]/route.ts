import { type NextRequest } from "next/server";
import { getContainer } from "@/mail/server/container";
import { workerFor } from "@/mail/server/worker";
import type { JobName } from "@/mail/worker/app";

export const runtime = "nodejs";
export const maxDuration = 300;

const JOBS: readonly JobName[] = ["renew-watches", "reconcile"];

/**
 * 定期ジョブ：watch の更新（毎日）と取りこぼしの照合。
 * Vercel Cron は GET に `Authorization: Bearer $CRON_SECRET` を付けて呼ぶ（vercel.json）。
 * Cloud Scheduler から OIDC 付きの POST で呼んでもよい（15分ごとの照合を Hobby プランで回したい場合など）。
 */
async function handle(req: NextRequest, { params }: { params: Promise<{ job: string }> }) {
  const { job } = await params;
  if (!JOBS.includes(job as JobName)) return new Response(null, { status: 404 });
  let c;
  try {
    c = getContainer();
  } catch {
    return new Response(null, { status: 503 });
  }
  const r = await workerFor(c).job(job as JobName, req.headers.get("authorization"));
  return r.body === undefined ? new Response(null, { status: r.status }) : Response.json(r.body, { status: r.status });
}

export const GET = handle;
export const POST = handle;
