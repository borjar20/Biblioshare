// src/components/detail/poster-font.ts
import { Anton } from "next/font/google";

// Solo la ficha la usa: se instancia aquí para no cargarla en toda la app.
export const posterFont = Anton({
  weight: "400",
  subsets: ["latin", "latin-ext"],
  variable: "--font-poster",
  display: "swap",
});
