import { redirect } from "next/navigation";
import { SettingsApp } from "@/components/SettingsApp";
import { getContainer } from "@/server/container";
import { getSession } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession(getContainer());
  if (!session) redirect("/login?next=/mail/settings");
  return <SettingsApp />;
}
