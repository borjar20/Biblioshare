import { Tiny5 } from "next/font/google";

// Solo rótulos y cifras de los wrap-ups (spec §5). Las frases van en la fuente
// de la app. `display: "swap"` explícito, como en src/app/layout.tsx.
//
// Tiny5 y no Pixelify Sans (la de la spec): en Pixelify el «5» es casi idéntico
// a la «S» y el «0» a la «O», así que «al 5 oct» se leía «al S oct» y la cifra
// «5 obras» como «S obras» — rompe el principio 3 de
// docs/design/paneles-estadisticos.md (todo valor importante se lee exacto).
// Comparada con VT323, Silkscreen y Jersey 10: Tiny5 distingue 5/S, 1/l/I (el 1
// lleva bandera) y 0/O (el 0 es más estrecho), tiene minúsculas, tildes y ñ, y
// conserva el carácter pixel. Solo existe en 400.
export const pixelFont = Tiny5({ subsets: ["latin", "latin-ext"], weight: "400", display: "swap", variable: "--font-pixel" });
