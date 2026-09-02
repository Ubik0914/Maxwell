import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ToastProvider } from "@/components/Toast";
import { ServiceWorkerRegistrar } from "@/components/pwa/ServiceWorkerRegistrar";
import { MOTION_BOOTSTRAP_SCRIPT } from "@/lib/motion";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Maxwell — DAG Task Manager",
  description: "Define a Start and a Goal, then build the path between them.",
  applicationName: "Maxwell",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: "/icons/apple-touch-icon.png",
  },
  /*
   * iOS has no manifest to read. Installed from Safari, it takes the
   * name and the standalone-ness from these instead — and it is the
   * platform where installing matters most, because a home screen app
   * is the only place iOS grants a push subscription at all.
   */
  appleWebApp: {
    capable: true,
    title: "Maxwell",
    statusBarStyle: "black-translucent",
  },
};

/*
 * The colour behind the status bar and the splash screen, so an
 * installed Maxwell opens out of the dark it is drawn in rather than
 * flashing white on the way in. It is --bg from globals.css; there is
 * one theme, so there is one value.
 */
export const viewport: Viewport = {
  themeColor: "#0a0d14",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Runs before the first paint so the page never opens with the
            wrong amount of motion and corrects itself a frame later. */}
        <script
          dangerouslySetInnerHTML={{ __html: MOTION_BOOTSTRAP_SCRIPT }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ToastProvider>
          <ServiceWorkerRegistrar />
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
