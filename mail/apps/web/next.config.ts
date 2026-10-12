import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// アプリ画面のCSP。メール本文は別途 sandbox iframe + meta CSP でさらに制限する。
// srcdoc の iframe は親のCSPを継承するため、img-src は「画像を表示」操作時の https を許可しておく。
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https: http:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self' about:",
  "frame-ancestors 'none'",
  "form-action 'self' https://accounts.google.com",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const config: NextConfig = {
  // Maxwell と同じオリジンの /mail 配下で動く（Maxwell 側の rewrites から転送される）
  basePath: "/mail",
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@synedge/mail-core", "@synedge/ui", "@synedge/database"],
  serverExternalPackages: ["postgres"],
  // 本番ビルドで型・lintエラーを見逃さない（lint はルートで実行）
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default config;
