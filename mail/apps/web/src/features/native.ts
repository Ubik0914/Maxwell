"use client";
// Capacitor（Androidアプリ）との連携。ブラウザでは何もしない。
// - FCM トークンの登録・更新
// - 通知タップ → 対象スレッドを開く
// - 外部ブラウザでのログイン結果（synedge://auth?code=...）の受け取り
import { webPath } from "@synedge/mail-core";
import { api } from "./api";

export const NOTIFICATION_CHANNEL_ID = "new_mail";

export async function isNative(): Promise<boolean> {
  const { Capacitor } = await import("@capacitor/core");
  return Capacitor.isNativePlatform();
}

export type PushPermission = "granted" | "denied" | "prompt" | "unsupported";

export async function getPushPermission(): Promise<PushPermission> {
  if (!(await isNative())) return "unsupported";
  const { PushNotifications } = await import("@capacitor/push-notifications");
  const p = await PushNotifications.checkPermissions();
  return p.receive === "granted" ? "granted" : p.receive === "denied" ? "denied" : "prompt";
}

/** 通知権限を求め、FCMへ登録する。トークンは registration イベントでサーバーへ送る */
export async function enablePush(): Promise<PushPermission> {
  if (!(await isNative())) return "unsupported";
  const { PushNotifications } = await import("@capacitor/push-notifications");
  let p = await PushNotifications.checkPermissions();
  if (p.receive === "prompt" || p.receive === "prompt-with-rationale") p = await PushNotifications.requestPermissions();
  if (p.receive !== "granted") return "denied";
  await PushNotifications.createChannel({
    id: NOTIFICATION_CHANNEL_ID,
    name: "新着メール",
    description: "新しいメールの通知",
    importance: 4,
    visibility: 0,
    vibration: true,
  });
  await PushNotifications.register();
  return "granted";
}

/** 通知データから開くべきアプリ内パスを決める（最小限の識別子のみ使う）。router.push に渡すので basePath は付けない */
export function urlForNotification(data: Record<string, unknown> | undefined): string {
  const threadId = typeof data?.threadId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(data.threadId) ? data.threadId : null;
  return threadId ? `/?thread=${encodeURIComponent(threadId)}` : "/";
}

/** 外部ブラウザからのディープリンクを解釈する */
export function handoffUrlFromDeepLink(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.host !== "auth" && u.pathname.replace(/^\/+/, "") !== "auth") return null;
    const code = u.searchParams.get("code");
    if (!code || !/^[A-Za-z0-9_-]{20,100}$/.test(code)) return null;
    return webPath(`/api/auth/handoff?code=${encodeURIComponent(code)}`);
  } catch {
    return null;
  }
}

let initialized = false;

/** アプリ起動時に一度だけ登録する */
export async function initNativeBridge(navigate: (url: string) => void): Promise<void> {
  if (initialized || !(await isNative())) return;
  initialized = true;
  const [{ PushNotifications }, { App }, { Browser }] = await Promise.all([
    import("@capacitor/push-notifications"),
    import("@capacitor/app"),
    import("@capacitor/browser"),
  ]);

  await PushNotifications.addListener("registration", (t) => {
    void api("/api/devices", { method: "POST", body: { token: t.value, platform: "android" } }).catch(() => {
      // 未ログイン時などは次回起動時に再登録される
    });
  });
  await PushNotifications.addListener("registrationError", () => {
    // 権限やGoogle Play開発者サービスの問題。設定画面で状態を表示する
  });
  await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    navigate(urlForNotification(action.notification.data as Record<string, unknown> | undefined));
  });

  await App.addListener("appUrlOpen", ({ url }) => {
    const target = handoffUrlFromDeepLink(url);
    if (target) {
      void Browser.close().catch(() => {});
      window.location.assign(target);
    }
  });
  await App.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else void App.minimizeApp();
  });

  // 権限が既にあれば起動のたびに登録し、トークン更新をサーバーへ反映する
  const p = await PushNotifications.checkPermissions();
  if (p.receive === "granted" && window.location.pathname !== webPath("/login")) await PushNotifications.register();
}

/** ログインを外部ブラウザで開く（GoogleはWebView内のOAuthを拒否するため） */
export async function startLogin(next: string): Promise<void> {
  if (await isNative()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url: `${window.location.origin}${webPath("/api/auth/google/start")}?platform=android&next=${encodeURIComponent(next)}` });
    return;
  }
  window.location.assign(webPath(`/api/auth/google/start?platform=web&next=${encodeURIComponent(next)}`));
}
