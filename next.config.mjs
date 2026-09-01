/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    // Lock down the browser surface without breaking the Convex connection,
    // inline styles Next emits, or the chunk preloads. Loosen specific entries
    // as the host origin changes.
    const isDev = process.env.NODE_ENV !== "production";

    // Scope the backend origin to THIS deployment. A wildcard over
    // *.convex.cloud allows every Convex project on the internet, which turns
    // any injected script into a working exfiltration channel.
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    const convexOrigins = [];
    if (convexUrl) {
      try {
        const { origin, host } = new URL(convexUrl);
        convexOrigins.push(origin, `wss://${host}`, origin.replace(".convex.cloud", ".convex.site"));
      } catch {
        // An unparseable URL is a deploy-time misconfiguration; fall through to
        // the wildcard rather than shipping a policy that blocks the backend.
      }
    }
    if (convexOrigins.length === 0) {
      convexOrigins.push("https://*.convex.cloud", "wss://*.convex.cloud", "https://*.convex.site");
    }

    const connectSrc = [
      "'self'",
      ...convexOrigins,
      ...(isDev ? ["ws://localhost:*", "http://localhost:*"] : []),
    ];
    const imgSrc = [
      "'self'",
      "data:",
      "blob:",
      "https://*.convex.cloud",
      "https://*.convex.site",
    ];
    // ponytail: 'unsafe-inline' is still required because Next streams inline
    // boot scripts and this app has no nonce plumbing. It blunts CSP's main
    // XSS protection, so the other directives are tightened to compensate.
    // Upgrade path: adopt a nonce in middleware and drop this entry.
    const scriptSrc = [
      "'self'",
      "'unsafe-inline'",
      ...(isDev ? ["'unsafe-eval'"] : []),
    ];

    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(self), geolocation=(self), microphone=(), payment=(), usb=()",
      },
      { key: "X-DNS-Prefetch-Control", value: "off" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
      {
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          `script-src ${scriptSrc.join(" ")}`,
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' data: https://fonts.gstatic.com",
          `img-src ${imgSrc.join(" ")}`,
          `connect-src ${connectSrc.join(" ")}`,
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "object-src 'none'",
          "frame-src 'none'",
          "worker-src 'self'",
          "manifest-src 'self'",
          ...(isDev ? [] : ["upgrade-insecure-requests"]),
        ].join("; "),
      },
    ];

    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
}

export default nextConfig
