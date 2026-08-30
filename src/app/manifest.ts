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
    // Mantener pulsado el icono de la PWA → «Nueva partida». Es el acceso directo a
    // Partidas para quien está en la mesa con el móvil (revisión UX 2026-08-30): la
    // subapp no tiene hueco en la navegación principal (decisión: shortcuts antes
    // que nav pública). El equivalente para la APK de Capacitor va aparte, con su
    // plugin nativo — ver la issue de app shortcuts Android.
    shortcuts: [
      {
        name: "Nueva partida",
        short_name: "Partida",
        description: "Contador de vidas para la mesa",
        url: "/partidas/mtg",
        icons: [{ src: "/icon-192", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
