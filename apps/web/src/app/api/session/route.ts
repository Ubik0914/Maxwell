import { json, route } from "@/server/http";

export const GET = route(async ({ c, session }) => {
  const [account] = await c.repos.accounts.listByUser(session.userId);
  return json({
    email: session.email,
    account: account
      ? { email: account.email, status: account.status, provider: account.provider }
      : null,
  });
});
