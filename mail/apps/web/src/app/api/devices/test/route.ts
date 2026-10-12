import { json, route } from "@/server/http";

/** 実証ゲート：サーバーから本人の端末へテスト通知を送る */
export const POST = route(
  async ({ c, session }) => {
    const outcome = await c.core.notifications.sendTest(session.userId);
    return json({ outcome });
  },
  { mutating: true, rateLimit: "sync" },
);
