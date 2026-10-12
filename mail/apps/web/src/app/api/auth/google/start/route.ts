import { NextResponse, type NextRequest } from "next/server";
import { startOAuth } from "@/server/auth-flow";
import { getContainer } from "@/server/container";

export async function GET(req: NextRequest) {
  const c = getContainer();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!c.limits.auth.take(`start:${ip}`).ok) return new NextResponse("Too Many Requests", { status: 429 });
  const platform = req.nextUrl.searchParams.get("platform") === "android" ? "android" : "web";
  const { url, cookie } = await startOAuth(c, platform, req.nextUrl.searchParams.get("next") ?? "/mail");
  const res = NextResponse.redirect(url);
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
}
