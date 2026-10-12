import { redirect } from "next/navigation";
import { Suspense } from "react";
import { MailApp } from "@/components/MailApp";
import { getContainer } from "@/server/container";
import { getSession } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await getSession(getContainer());
  if (!session) {
    // 通知タップ時にログイン切れでも、ログイン後に対象スレッドへ戻れるようにする
    const sp = new URLSearchParams(Object.entries(await searchParams).filter((e): e is [string, string] => typeof e[1] === "string"));
    redirect(`/login?next=${encodeURIComponent(`/mail${sp.size ? `?${sp}` : ""}`)}`);
  }
  return (
    <Suspense>
      <MailApp accountEmail={session.email} />
    </Suspense>
  );
}
