import type { ReactNode } from "react";

// Pares de rayas del handoff Paper: verde club, libro, película, serie. Son
// "portada", no superficie de UI: se quedan fijos en claro y oscuro, igual que
// la cubierta de un libro.
const STRIPE_PAIRS: [string, string][] = [
  ["#4a5540", "#414c39"],
  ["#8a4d2b", "#7d4426"],
  ["#2f5457", "#2a4d4f"],
  ["#5f4459", "#553d4f"],
];

// Determinista desde el seed (el id del club): el mismo club pinta siempre las
// mismas rayas, en servidor y en cliente — nada de random que rompa hydration.
function stripesFor(seed: string): string {
  let sum = 0;
  for (let i = 0; i < seed.length; i++) sum += seed.charCodeAt(i);
  const [a, b] = STRIPE_PAIRS[sum % STRIPE_PAIRS.length];
  return `repeating-linear-gradient(115deg, ${a} 0 14px, ${b} 14px 28px)`;
}

// Banda de portada de un club: la imagen si la hay, y si no un patrón de rayas
// diagonales estilo Paper. Sin hooks a propósito: se usa igual desde server
// components (cabecera) y client components (tarjeta del listado).
export function ClubCoverBand({
  coverUrl,
  seed,
  className = "",
  children,
}: {
  coverUrl: string | null;
  /** Algo estable del club (su id) que decide el patrón de placeholder. */
  seed: string;
  className?: string;
  /** Contenido flotante sobre la banda (p. ej. el chip Público/Privado). */
  children?: ReactNode;
}) {
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={coverUrl ? undefined : { backgroundImage: stripesFor(seed) }}
    >
      {coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- portada externa/Storage, mismo criterio que profile-header
        <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
      {children}
    </div>
  );
}
