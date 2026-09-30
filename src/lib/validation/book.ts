import { z } from "zod";
import { normalizeIsbn } from "@/domain/library/isbn";

/** A blank box is "not written down", which the table stores as null. */
function optionalText(max: number, label: string) {
  return z
    .string()
    .trim()
    .max(max, `${label}は${max}文字以内で入力してください`)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null));
}

export const bookFieldsSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "書名を入力してください")
    .max(500, "書名は500文字以内で入力してください"),
  authors: optionalText(500, "著者"),
  publisher: optionalText(200, "出版社"),
  published: optionalText(20, "発売日"),
  price: z
    .number()
    .int("価格は円単位の整数で入力してください")
    .min(0, "価格に負の値は入れられません")
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  isbn: z
    .string()
    .nullable()
    .optional()
    .transform((value, ctx) => {
      if (!value || value.trim() === "") return null;
      const isbn = normalizeIsbn(value);
      if (!isbn) {
        ctx.addIssue({
          code: "custom",
          message: "ISBN の形式またはチェックディジットが正しくありません",
        });
        return z.NEVER;
      }
      return isbn;
    }),
  location: optionalText(100, "場所"),
  cover_url: z
    .string()
    .trim()
    .max(500)
    .regex(/^https:\/\//, "表紙の URL は https で始まる必要があります")
    .nullable()
    .optional()
    .transform((value) => (value ? value : null)),
  note: optionalText(5000, "メモ"),
});

export type BookFields = z.infer<typeof bookFieldsSchema>;
export type BookFieldsInput = z.input<typeof bookFieldsSchema>;

export const isbnLookupSchema = z.string().transform((value, ctx) => {
  const isbn = normalizeIsbn(value);
  if (!isbn) {
    ctx.addIssue({
      code: "custom",
      message: "ISBN の形式またはチェックディジットが正しくありません",
    });
    return z.NEVER;
  }
  return isbn;
});

/** The query string GET /api/v1/books reads. Everything is optional. */
export const bookSearchSchema = z.object({
  q: z.string().max(200, "Query must be 200 characters or fewer").default(""),
  sort: z.enum(["recent", "title", "author", "published"]).default("recent"),
  limit: z.coerce.number().int().min(1).max(5000).default(50),
});
