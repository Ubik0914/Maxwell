import type { CapacitorConfig } from "@capacitor/cli";

// アプリは本番 Web（Next.js）を WebView で開く。UI はサーバー側でデプロイすれば更新される。
// SYNEDGE_WEB_URL は `cap sync` 実行時に読み込まれ、android/app/src/main/assets/capacitor.config.json に書き込まれる。
// メールは Maxwell の /mail にあるので、URL は https://<Maxwell のドメイン>/mail の形にする。
// ログインは WebView 内の Maxwell のログイン画面で行い、Gmail の接続だけ外部ブラウザを使う。
const url = process.env.SYNEDGE_WEB_URL ?? "https://synedge.example.com";

const config: CapacitorConfig = {
  appId: "app.synedge.mail",
  appName: "メール",
  webDir: "www",
  server: {
    url,
    // 本番は HTTPS のみ。http://（ローカル開発）は明示的に許可した場合だけ
    cleartext: url.startsWith("http://"),
    androidScheme: "https",
    errorPath: "offline.html",
  },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: process.env.SYNEDGE_WEBVIEW_DEBUG === "1",
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
