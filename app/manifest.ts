import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "MyShotLog",
    short_name: "MyShotLog",
    start_url: "/dashboard/",
    scope: "/",
    display: "standalone",
    background_color: "#f6f8f5",
    theme_color: "#315d43",
    icons: [
      {
        src: "/brand/MyShotLog-app-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/MyShotLog-app-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
