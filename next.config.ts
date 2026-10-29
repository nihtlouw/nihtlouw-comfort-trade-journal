import type { NextConfig } from "next";
const isGithubPages = process.env.NEXT_PUBLIC_GITHUB_PAGES === "true";
const nextConfig: NextConfig = {
  devIndicators: false, // The developer badge otherwise covers mobile navigation in the preview.
  allowedDevOrigins: ["*.e2b.app", "localhost", "127.0.0.1"],
  ...(isGithubPages ? { output: "export" as const, basePath: "/nihtlouw-comfort-trade-journal", assetPrefix: "/nihtlouw-comfort-trade-journal/", trailingSlash: true, images: { unoptimized: true } } : {}),
};
export default nextConfig;
