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
    const connectSrc = [
      "'self'",
      "https://*.convex.cloud",
      "wss://*.convex.cloud",
      "https://*.convex.site",
      ...(isDev ? ["ws://localhost:*", "http://localhost:*"] : []),
    ];
    const imgSrc = [
      "'self'",
      "data:",
      "blob:",
      "https://*.convex.cloud",
      "https://*.convex.site",
    ];
    const scriptSrc = [
      "'self'",
      "'unsafe-inline'", // Next.js streams inline boot scripts
      ...(isDev ? ["'unsafe-eval'"] : []),
    ];

    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=()" },
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
