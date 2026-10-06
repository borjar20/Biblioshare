import { Pixelify_Sans } from "next/font/google";

// Solo rótulos y cifras de los wrap-ups (spec §5). Las frases van en la fuente
// de la app. `display: "swap"` explícito, como en src/app/layout.tsx.
export const pixelFont = Pixelify_Sans({ subsets: ["latin", "latin-ext"], weight: ["500", "700"], display: "swap", variable: "--font-pixel" });
