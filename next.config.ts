import type { NextConfig } from "next";

const isGithubPages = process.env.NEXT_PUBLIC_GITHUB_PAGES === "true";
const isCapacitorAndroid = process.env.NEXT_PUBLIC_ANDROID_CAPACITOR === "true";
const isDev = process.env.NODE_ENV !== "production";

/**
 * Content Security Policy.
 *
 * Bloom loads no third-party scripts. The only cross-origin surfaces are:
 *  - YouTube embeds (privacy-enhanced, youtube-nocookie.com) in the watch panel,
 *  - Google sign-in (only when GOOGLE_CLIENT_ID is configured),
 *  - Lemon Squeezy hosted checkout (only when its env keys are set).
 * Journal screenshots and PDF strategy books are rendered from `blob:` URLs and
 * fonts are self-hosted via @fontsource, so no external font/asset origins are
 * needed. React injects inline styles, hence `style-src 'unsafe-inline'`.
 *
 * `'unsafe-eval'` is scoped to development only: the dev/refresh runtime needs it.
 * `connect-src` allows ws/wss in development for hot reload.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${isDev ? " blob:" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.ytimg.com https://i.ytimg.com",
  "font-src 'self'",
  "media-src 'self' blob:",
  "frame-src 'self' blob: https://www.youtube-nocookie.com",
  "worker-src 'self' blob:",
  `connect-src 'self' https://www.youtube-nocookie.com${isDev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://*.lemonsqueezy.com",
  "frame-ancestors 'none'",
].join("; ");

/**
 * Static exports (GitHub Pages, Capacitor) have no server to emit headers, so the
 * policy is only attached for server deployments. The Pages/Android builds rely on
 * the <meta> fallbacks in `layout.tsx` and on the host's own configuration.
 */
const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  {
    // Two years, including subdomains. Safe for an app that is HTTPS-only outside localhost.
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  devIndicators: false, // The developer badge otherwise covers mobile navigation in the preview.
  allowedDevOrigins: ["*.e2b.app", "localhost", "127.0.0.1"],
  poweredByHeader: false,
  ...(isGithubPages
    ? {
        output: "export" as const,
        basePath: "/nihtlouw-comfort-trade-journal",
        assetPrefix: "/nihtlouw-comfort-trade-journal/",
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : isCapacitorAndroid
      ? {
          output: "export" as const,
          trailingSlash: true,
          images: { unoptimized: true },
        }
      : {
          // Static exports cannot attach response headers.
          async headers() {
            return [{ source: "/:path*", headers: securityHeaders }];
          },
        }),
};

export default nextConfig;
