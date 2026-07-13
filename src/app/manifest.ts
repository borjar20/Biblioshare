import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Biblioshare",
    short_name: "Biblioshare",
    description: "Tu biblioteca de libros, películas y series en un solo lugar.",
    start_url: "/",
    display: "standalone",
    // Espejo manual de --background y --accent (modo claro) de globals.css.
    background_color: "#f3ece1",
    theme_color: "#b0542f",
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
