import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./platform.css";
import "@/lib/demo/install";

export const metadata: Metadata = {
  title: { default: "Long Snap · free league sites for Sleeper", template: "%s · Long Snap" },
  description: "Long Snap turns your Sleeper league into a full league website. Free, on your own account, no code.",
  applicationName: "Long Snap",
  // Phone app (2026-11-13): full screen from the home screen, with the site's icon (league pages set their own).
  appleWebApp: { capable: true, title: "Long Snap", statusBarStyle: "default" },
  icons: { icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f172a" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
