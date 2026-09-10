/** Contenido de la tienda. Vive en código, como `LOOT_ITEMS`: la base de datos no
 * guarda precios ni tarifas, los recibe resueltos (spec §4.3). */

/** Solo cuentan los hechos con fecha igual o posterior a esta (spec §3.1). Sin
 * ella, la primera recogida barrería el historial entero de una cuenta veterana.
 * Vale la fecha del día en que la migración llega a producción; si el despliegue
 * se retrasa un día, el único efecto es un día más de gracia. */
export const ACORN_EPOCH = "2026-09-11";

export const ACORN_RATES = { day: 10, mission: 5, achievement: 20, welcome: 50 } as const;
export type AcornKind = keyof typeof ACORN_RATES;

export interface CampScene {
  id: string;
  price: number;
  /** Fichero en `public/pet/scenes/`. */
  file: string;
  /** Tamaño NATIVO del WebP. Cada escena trae el suyo: el generador devuelve
   * relleno que se recorta, así que fingir un alto común rompe la escala entera. */
  width: number;
  height: number;
}

export const DEFAULT_SCENE_ID = "camp";

// Hasta que la Task 2 genere el arte, las cuatro de pago apuntan al fichero de
// siempre: el catálogo se ve y se compra, y nadie mira un hueco roto.
export const CAMP_SCENES = [
  { id: "camp", price: 0, file: "camp-portrait.webp", width: 288, height: 384 },
  { id: "creek", price: 100, file: "camp-portrait.webp", width: 288, height: 384 },
  { id: "autumn", price: 150, file: "camp-portrait.webp", width: 288, height: 384 },
  { id: "night", price: 150, file: "camp-portrait.webp", width: 288, height: 384 },
  { id: "snow", price: 150, file: "camp-portrait.webp", width: 288, height: 384 },
] as const satisfies readonly CampScene[];

export type CampSceneId = (typeof CAMP_SCENES)[number]["id"];

export function isCampSceneId(value: unknown): value is CampSceneId {
  return typeof value === "string" && CAMP_SCENES.some(scene => scene.id === value);
}

export function campScene(id: string): CampScene {
  const scene = CAMP_SCENES.find(entry => entry.id === id);
  if (!scene) throw new Error(`escena desconocida: ${id}`);
  return scene;
}

export function scenePrice(id: string): number {
  return campScene(id).price;
}
