import type { AccountInfo } from "@/mail/core";
import { json, route } from "@/mail/server/http";

export const GET = route(async ({ c, session }) => {
  const accounts = await c.repos.accounts.listByUser(session.userId);
  const items: AccountInfo[] = accounts.map((a) => ({
    id: a.id,
    provider: a.provider,
    email: a.email,
    status: a.status,
    watchExpiresAt: a.watchExpiresAt?.toISOString() ?? null,
    watchLastError: a.watchLastError,
    lastSyncedAt: a.lastSyncedAt?.toISOString() ?? null,
  }));
  return json({ userEmail: session.email, accounts: items, pushConfigured: !!c.env.FCM_SERVICE_ACCOUNT_JSON, watchConfigured: !!c.env.GMAIL_PUBSUB_TOPIC });
});
