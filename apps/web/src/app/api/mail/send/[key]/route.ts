import { json, route } from "@/server/http";

/** 送信状態の再確認（結果不明時に送信済みフォルダを照合する） */
export const GET = route<{ key: string }>(async ({ c, session }, { key }) => json(await c.core.mail.getSendStatus(session, key)));
