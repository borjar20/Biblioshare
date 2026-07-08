import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Biblioshare",
    short_name: "Biblioshare",
    description: "Tu biblioteca de libros, películas y series en un solo lugar.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffe9fc",
    theme_color: "#2c002b",
    icons: [
      {
        src: "/icon-192",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
