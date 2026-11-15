import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Pebble — Say the house. Find your home.",
  description: "Voice-first property concierge for brokerages, powered by an Agentic Assistant. The Agentic Assistant suggests, a Real Estate Agent verifies.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, themeColor: "#FBF2F2" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
