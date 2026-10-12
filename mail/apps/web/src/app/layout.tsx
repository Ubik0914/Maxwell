import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { NativeBridge } from "@/components/NativeBridge";
import "./globals.css";

export const metadata: Metadata = {
  title: "Synedge",
  description: "個人用メールクライアント",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#171b20" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <NativeBridge />
        {children}
      </body>
    </html>
  );
}
