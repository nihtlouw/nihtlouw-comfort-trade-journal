import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/dm-serif-display/400.css";
import "@fontsource/dm-serif-display/400-italic.css";
import "./globals.css";

const basePath = process.env.NEXT_PUBLIC_GITHUB_PAGES === "true" ? "/nihtlouw-comfort-trade-journal" : "";
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#6e9f79" };
export const metadata: Metadata = { title: "bloom — your mindful trading journal", description: "A calmer, more intentional space for your trading journey.", manifest: `${basePath}/manifest.webmanifest`, icons: { icon: `${basePath}/icons/bloom-192.png`, apple: `${basePath}/icons/bloom-192.png` }, appleWebApp: { capable: true, title: "Bloom", statusBarStyle: "default" } };
export default function RootLayout({ children }: { children: ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
