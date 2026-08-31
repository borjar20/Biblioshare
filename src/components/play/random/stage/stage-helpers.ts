// Helpers puros de la capa de escenarios del Aleatorio (spec visual §6).
// Solo geometría, hashes y vibración: nada de estado, nada de DOM (salvo
// buzz, que degrada a no-op), nada del motor.

const PALETTE_SIZE = 6;

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Color estable por nombre sobre los 6 tokens de asiento de Play. Dos nombres
// distintos PUEDEN chocar (paleta de 6): asumido, el color es apoyo visual.
export function stableColor(name: string): string {
  return `var(--play-seat-${(hashString(name) % PALETTE_SIZE) + 1})`;
}

// Sectores de la ruleta. Convención: 0° arriba, crece en sentido horario.
export function wheelSectors(
  players: string[],
): { name: string; start: number; end: number; color: string }[] {
  const step = 360 / players.length;
  return players.map((name, i) => ({
    name,
    start: i * step,
    end: (i + 1) * step,
    color: stableColor(name),
  }));
}

// Ángulo final (turns vueltas enteras + resto) que deja el CENTRO del sector
// de `picked` bajo la flecha (arriba). Girar la rueda +r mueve los sectores r
// grados en horario, así que para subir el centro c se gira 360-c.
export function wheelTargetAngle(players: string[], picked: string, turns: number): number {
  const i = Math.max(0, players.indexOf(picked));
  const step = 360 / players.length;
  const center = i * step + step / 2;
  return turns * 360 + ((360 - center) % 360);
}

// Vibración sutil al aterrizar. No-op donde no hay soporte (iOS Safari, SSR).
export function buzz(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(30);
}

export type DieShapeKind = "d4" | "d6" | "d8" | "d10" | "d12" | "d20" | "round";

// Silueta por familia clásica de mesa; 100 es el percentil (usa el d10). El
// resto (2, 7, 30, 1000…) cae en círculo.
export function dieShapeFor(sides: number): DieShapeKind {
  switch (sides) {
    case 4:
      return "d4";
    case 6:
      return "d6";
    case 8:
      return "d8";
    case 10:
    case 100:
      return "d10";
    case 12:
      return "d12";
    case 20:
      return "d20";
    default:
      return "round";
  }
}
