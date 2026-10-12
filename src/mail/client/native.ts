"use client";
// Capacitor（Androidアプリ）との連携。ブラウザでは何もしない。
// - FCM トークンの登録・更新
// - 通知タップ → 対象スレッドを開く
// - 外部ブラウザでの Gmail 接続結果（synedge://auth?result=connected / ?error=...）の受け取り
//   ログインそのものは WebView 内の Maxwell のログイン画面で行う（Supabase）
import { webPath } from "@/mail/core";
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

/** 通知データから開くべきパスを決める（最小限の識別子のみ使う） */
export function urlForNotification(data: Record<string, unknown> | undefined): string {
  const threadId = typeof data?.threadId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(data.threadId) ? data.threadId : null;
  return threadId ? webPath(`/?thread=${encodeURIComponent(threadId)}`) : webPath("/");
}

/**
 * 外部ブラウザから戻るディープリンクを、WebView で開く設定画面のパスにする。
 * 接続そのものはサーバー側で済んでいる（WebView はもともと Maxwell にログイン済み）。
 */
export function connectResultFromDeepLink(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.host !== "auth" && u.pathname.replace(/^\/+/, "") !== "auth") return null;
    if (u.searchParams.get("result") === "connected") return webPath("/settings?connected=1");
    const error = u.searchParams.get("error");
    if (error) return webPath(`/settings?error=${encodeURIComponent(error.slice(0, 300))}`);
    return null;
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
    const target = connectResultFromDeepLink(url);
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
  if (p.receive === "granted" && window.location.pathname !== "/login") await PushNotifications.register();
}

/**
 * Gmail の接続（Google の同意画面）を始める。
 * ブラウザではそのまま移動する（Maxwell のログイン Cookie で利用者が分かる）。
 * Android アプリでは Google が WebView 内の OAuth を拒むため外部ブラウザで開く。外部ブラウザには
 * ログイン Cookie がないので、先に WebView で短命の接続チケットを受け取り、それを持たせて開く。
 */
export async function startGmailConnect(next: string): Promise<void> {
  if (await isNative()) {
    const { url } = await api<{ url: string }>("/api/auth/google/ticket", { method: "POST", body: { next } });
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
    return;
  }
  window.location.assign(webPath(`/api/auth/google/start?platform=web&next=${encodeURIComponent(next)}`));
}
