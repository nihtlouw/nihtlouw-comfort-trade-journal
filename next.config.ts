import type { NextConfig } from "next";

const isGithubPages = process.env.NEXT_PUBLIC_GITHUB_PAGES === "true";

const nextConfig: NextConfig = {
  ...(isGithubPages ? {
    output: "export" as const,
    basePath: "/nihtlouw-comfort-trade-journal",
    assetPrefix: "/nihtlouw-comfort-trade-journal/",
    trailingSlash: true,
    images: { unoptimized: true },
  } : {}),
};

export default nextConfig;
