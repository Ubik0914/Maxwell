import { redirect } from "next/navigation";
import { SettingsApp } from "@/mail/components/SettingsApp";
import { NotConfigured } from "@/mail/components/NotConfigured";
import { tryGetContainer } from "@/mail/server/container";
import { getSession } from "@/mail/server/session";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const c = tryGetContainer();
  if (!c) return <NotConfigured />;
  const session = await getSession(c);
  if (!session) redirect("/login?next=/mail/settings");
  const sp = await searchParams;
  // Gmail 接続（OAuth）から戻ったときの結果
  const error = typeof sp.error === "string" ? sp.error.slice(0, 300) : null;
  const notice = error
    ? { kind: "error" as const, text: error }
    : sp.connected === "1"
      ? { kind: "success" as const, text: "Gmail をつなぎました。" }
      : null;
  return <SettingsApp initialMessage={notice} />;
}
