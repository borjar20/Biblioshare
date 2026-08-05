import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Biblioshare",
    short_name: "Biblioshare",
    description: "Tu biblioteca de libros, películas y series en un solo lugar.",
    start_url: "/",
    display: "standalone",
    // theme_color = --accent (modo claro) de globals.css.
    // background_color = --accent a propósito (NO --background): es el fondo del
    // splash nativo de Android (icono de la marca centrado sobre él) y del
    // primer paint de la PWA, para que el arranque nativo no muestre un flash
    // de papel antes de la marca. (El overlay web `SplashScreen` se retiró; ver
    // issue tipo:acta y decisiones.md.)
    background_color: "#b0542f",
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
