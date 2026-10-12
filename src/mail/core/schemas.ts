// 入力検証スキーマ。UI（事前チェック）とサーバー（最終チェック）で同じものを使う。
import { z } from "zod";

export const LIMITS = {
  pageSizeMax: 50,
  pageSizeDefault: 25,
  queryMaxLength: 500,
  subjectMaxLength: 998,
  /** 本文 200,000 文字（Gmailの上限よりかなり小さく、誤操作の巨大送信を防ぐ） */
  bodyMaxLength: 200_000,
  recipientsMax: 50,
  idMaxLength: 128,
} as const;

/** 制御文字（ヘッダーインジェクション対策で改行を含む） */
 
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export const providerIdSchema = z
  .string()
  .min(1)
  .max(LIMITS.idMaxLength)
  .regex(/^[A-Za-z0-9_-]+$/, "IDの形式が不正です");

const EMAIL_RE = /^[^\s@<>(),;:"\\[\]]+@[^\s@<>(),;:"\\[\]]+\.[^\s@<>(),;:"\\[\]]+$/;

/** "Name <addr>" または "addr" を受け付ける */
export const recipientSchema = z
  .string()
  .trim()
  .min(1)
  .max(320)
  .refine((v) => !CONTROL_CHARS.test(v), "宛先に改行や制御文字は使えません")
  .refine((v) => {
    const m = /<([^<>]+)>\s*$/.exec(v);
    return EMAIL_RE.test((m?.[1] ?? v).trim());
  }, "メールアドレスの形式が正しくありません");

const recipientList = z.array(recipientSchema).max(LIMITS.recipientsMax);

export const subjectSchema = z
  .string()
  .max(LIMITS.subjectMaxLength)
  .refine((v) => !CONTROL_CHARS.test(v), "件名に改行や制御文字は使えません");

export const bodySchema = z.string().max(LIMITS.bodyMaxLength, "本文が長すぎます");

/** 下書き保存用。宛先・件名・本文が空でも保存できる */
export const draftInputSchema = z.object({
  to: recipientList.default([]),
  cc: recipientList.default([]),
  bcc: recipientList.default([]),
  subject: subjectSchema.default(""),
  body: bodySchema.default(""),
  threadId: providerIdSchema.optional(),
  /** 返信元メッセージ（Gmail message id）。In-Reply-To/References はサーバーで元メールから組み立てる */
  replyToMessageId: providerIdSchema.optional(),
});
export type DraftInput = z.infer<typeof draftInputSchema>;

/** 送信用。宛先・件名・本文は必須（仕様2章8） */
export const sendInputSchema = draftInputSchema
  .extend({
    subject: subjectSchema.refine((v) => v.trim().length > 0, "件名を入力してください"),
    body: bodySchema.refine((v) => v.trim().length > 0, "本文を入力してください"),
    /** 送信元の下書き。指定時は下書きを更新してから送る */
    draftId: providerIdSchema.optional(),
    /** 二重送信防止キー（作成画面ごとに1つ生成） */
    idempotencyKey: z.string().uuid("送信キーが不正です"),
  })
  .refine((v) => v.to.length > 0, { message: "宛先を入力してください", path: ["to"] });
export type SendInput = z.infer<typeof sendInputSchema>;

export const listQuerySchema = z.object({
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(LIMITS.pageSizeMax).default(LIMITS.pageSizeDefault),
});

export const searchQuerySchema = listQuerySchema.extend({
  q: z
    .string()
    .trim()
    .min(1, "検索語を入力してください")
    .max(LIMITS.queryMaxLength)
    .refine((v) => !CONTROL_CHARS.test(v), "検索語に制御文字は使えません"),
});

export const replyModeSchema = z.enum(["reply", "replyAll"]);
export type ReplyMode = z.infer<typeof replyModeSchema>;

export const settingsPatchSchema = z
  .object({
    notificationsEnabled: z.boolean().optional(),
    notificationPreview: z.boolean().optional(),
  })
  .strict();

export const deviceRegisterSchema = z.object({
  token: z.string().min(10).max(4096).regex(/^[A-Za-z0-9_:.-]+$/),
  platform: z.enum(["android", "web"]),
});

export function firstIssueMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue ? issue.message : "入力内容に誤りがあります";
}
