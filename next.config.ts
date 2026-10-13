import type { NextConfig } from "next";
import { buildCommit } from "./lib/build-commit";
const config: NextConfig = {
  env: { MYSHOTLOG_BUILD_COMMIT: buildCommit() },
  poweredByHeader: false,
  trailingSlash: true,
  outputFileTracingIncludes: {
    "/api/sessions/*/pdf": [
      "./lib/fonts/DidactGothic-Regular.ttf",
      "./public/brand/MyShotLog-logo.svg",
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      {
        source: "/witness/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
    ];
  },
};
export default config;
