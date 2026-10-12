import { LoginPanel } from "@/components/LoginPanel";
import { safeNext } from "@/server/auth-flow";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return <LoginPanel error={sp.error?.slice(0, 300) ?? null} next={safeNext(sp.next)} />;
}
