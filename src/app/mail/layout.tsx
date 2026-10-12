import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { NativeBridge } from "@/mail/components/NativeBridge";

export const metadata: Metadata = {
  title: "メール",
  description: "Gmail を読む・書く・送る。",
  robots: { index: false, follow: false },
};

/* The library's dark (styles/library.css): mail wears the same glass. */
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#0d0d0e",
};

/**
 * The mail client (formerly Synedge), inside Maxwell.
 *
 * It has no sign-in of its own: whoever is signed in to Maxwell is the
 * user, and Gmail is something they connect from the settings. The
 * colours are the library's (theme-raycast); styles/mail.css only adds
 * the few names the mail screens use that the library has no word for.
 */
export default function MailLayout({ children }: { children: ReactNode }) {
  return (
    <div className="theme-raycast mail-root min-h-dvh bg-bg text-text">
      <NativeBridge />
      {children}
    </div>
  );
}
