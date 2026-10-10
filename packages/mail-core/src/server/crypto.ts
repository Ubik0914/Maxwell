// トークン暗号化（AES-256-GCM）。鍵は環境変数（秘密管理機構）にのみ置き、DBには暗号文だけを保存する。
// 形式: "<keyId>.<iv>.<ciphertext>.<tag>"（各base64url）。keyIdで鍵ローテーションに対応する。
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

export class TokenCipher {
  private readonly keys: Map<string, Buffer>;
  private readonly primaryId: string;

  /**
   * @param spec "k1:<base64 32byte>,k0:<base64 32byte>" の形式。先頭が暗号化に使う現行鍵。
   */
  constructor(spec: string) {
    const entries = spec
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((entry) => {
        const idx = entry.indexOf(":");
        if (idx <= 0) throw new Error("TOKEN_ENCRYPTION_KEYS の形式が不正です（id:base64 をカンマ区切り）");
        const id = entry.slice(0, idx);
        const key = Buffer.from(entry.slice(idx + 1), "base64");
        if (key.length !== 32) throw new Error(`暗号鍵 ${id} は32バイトである必要があります`);
        if (!/^[a-zA-Z0-9]+$/.test(id)) throw new Error("鍵IDは英数字のみ使えます");
        return [id, key] as const;
      });
    if (entries.length === 0) throw new Error("TOKEN_ENCRYPTION_KEYS が空です");
    this.keys = new Map(entries);
    this.primaryId = entries[0]![0];
  }

  encrypt(plaintext: string, aad: string): string {
    const key = this.keys.get(this.primaryId)!;
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(aad, "utf8"));
    const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [this.primaryId, iv.toString("base64url"), ct.toString("base64url"), tag.toString("base64url")].join(".");
  }

  decrypt(payload: string, aad: string): string {
    const [id, iv, ct, tag] = payload.split(".");
    if (!id || !iv || ct === undefined || !tag) throw new Error("暗号文の形式が不正です");
    const key = this.keys.get(id);
    if (!key) throw new Error(`暗号鍵 ${id} が見つかりません`);
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
  }

  needsRotation(payload: string): boolean {
    return !payload.startsWith(`${this.primaryId}.`);
  }
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
