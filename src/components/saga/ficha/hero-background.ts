// Fondo del hero de saga (spec 2026-10-27 §1). Las sagas no tienen backdrop
// propio: el de TMDB de su primera película, o un mosaico de portadas de sus
// obras. Puro para poder probarlo, como `pickHeroBackground` de la ficha de obra.
export type SagaHeroBackground =
  | { kind: "backdrop"; src: string }
  | { kind: "mosaic"; covers: string[] }
  | { kind: "none" };

const MOSAIC_MAX = 12;
const MOSAIC_MIN = 6;

export function pickSagaHeroBackground({ backdropUrl, covers }: { backdropUrl: string | null; covers: string[] }): SagaHeroBackground {
  if (backdropUrl) return { kind: "backdrop", src: backdropUrl };
  if (covers.length === 0) return { kind: "none" };
  const out = covers.slice(0, MOSAIC_MAX);
  // Con pocas portadas, repetir llena el lienzo: un mosaico de 3 teselas se lee
  // como tres cuadros sueltos, no como textura.
  while (out.length < MOSAIC_MIN) out.push(...covers.slice(0, MOSAIC_MIN - out.length));
  return { kind: "mosaic", covers: out };
}
