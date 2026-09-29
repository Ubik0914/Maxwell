import { LoginForm } from "@/features/auth/components/LoginForm";
import { safeNextPath } from "@/lib/navigation/safe-next";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const next = safeNextPath((await searchParams).next) ?? undefined;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <h1 className="text-2xl font-semibold text-accent">Log in</h1>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
