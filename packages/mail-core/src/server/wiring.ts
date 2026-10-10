// Web・Worker・MCP が同じ構成で MailService / SyncService を組み立てるための共通配線。
import { TokenCipher } from "./crypto";
import { FcmSender, parseServiceAccount, unconfiguredPushSender } from "./fcm";
import { GmailClient } from "./gmail/client";
import { GmailProvider } from "./gmail/provider";
import type { GoogleOAuthConfig } from "./google-oauth";
import type { Logger } from "./logger";
import { MailService } from "./mail-service";
import { NotificationService } from "./notification-service";
import {
  systemClock,
  type AccountRepository,
  type Clock,
  type DeliveryRepository,
  type DeviceRepository,
  type PushSender,
  type SendRepository,
  type SettingsRepository,
  type UserRepository,
} from "./ports";
import type { ProviderFactory } from "./provider";
import { SyncService } from "./sync-service";
import { GoogleTokenManager } from "./token-manager";

export interface Repositories {
  users: UserRepository;
  accounts: AccountRepository;
  settings: SettingsRepository;
  devices: DeviceRepository;
  deliveries: DeliveryRepository;
  sends: SendRepository;
}

export interface CoreConfig {
  oauth: GoogleOAuthConfig;
  tokenEncryptionKeys: string;
  pubsubTopic: string | null;
  fcmServiceAccountJson: string | null;
  /** 鍵ファイルを使わずメタデータサーバーで認証する場合の Firebase プロジェクトID（Cloud Run 向け） */
  fcmProjectId?: string | null;
}

export interface CoreServices {
  cipher: TokenCipher;
  tokens: GoogleTokenManager;
  providerFactory: ProviderFactory;
  mail: MailService;
  notifications: NotificationService;
  sync: SyncService;
  push: PushSender;
}

export function createCoreServices(
  repos: Repositories,
  config: CoreConfig,
  opts: { logger: Logger; clock?: Clock; fetchImpl?: typeof fetch; providerFactory?: ProviderFactory; push?: PushSender },
): CoreServices {
  const clock = opts.clock ?? systemClock;
  const cipher = new TokenCipher(config.tokenEncryptionKeys);
  const tokens = new GoogleTokenManager({
    accounts: repos.accounts,
    cipher,
    oauth: config.oauth,
    clock,
    logger: opts.logger,
    fetchImpl: opts.fetchImpl,
  });
  const providerFactory: ProviderFactory =
    opts.providerFactory ??
    ((account) => {
      if (account.provider !== "gmail") throw new Error(`未対応のプロバイダー: ${account.provider}`);
      return new GmailProvider(new GmailClient({ tokens: tokens.forAccount(account), clock, fetchImpl: opts.fetchImpl }));
    });
  const push =
    opts.push ??
    (config.fcmServiceAccountJson
      ? new FcmSender(parseServiceAccount(config.fcmServiceAccountJson), opts.fetchImpl)
      : config.fcmProjectId
        ? new FcmSender({ kind: "metadata", projectId: config.fcmProjectId }, opts.fetchImpl)
        : unconfiguredPushSender);
  const mail = new MailService({ accounts: repos.accounts, sends: repos.sends, providerFactory, logger: opts.logger });
  const notifications = new NotificationService({
    accounts: repos.accounts,
    settings: repos.settings,
    devices: repos.devices,
    deliveries: repos.deliveries,
    push,
    providerFactory,
    clock,
    logger: opts.logger,
  });
  const sync = new SyncService({
    accounts: repos.accounts,
    providerFactory,
    notifications,
    clock,
    logger: opts.logger,
    pubsubTopic: config.pubsubTopic,
  });
  return { cipher, tokens, providerFactory, mail, notifications, sync, push };
}
