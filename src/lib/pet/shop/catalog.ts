/** Contenido de la tienda. Vive en código, como `LOOT_ITEMS`: la base de datos no
 * guarda precios ni tarifas, los recibe resueltos (spec §4.3). */

/** Solo cuentan los hechos con fecha igual o posterior a esta (spec §3.1). Sin
 * ella, la primera recogida barrería el historial entero de una cuenta veterana.
 *
 * ATENCIÓN al aplicar la migración `20260911_pet_acorns.sql` a producción:
 * esta constante vale el día REAL de ese despliegue, no la fecha en que se
 * escribió este código. Nada la ata automáticamente a la fecha real (revisión
 * final de rama R5, hallazgo 2) — si se despliega más tarde y esta fecha se
 * deja atrás sin tocar, cada día de diferencia regala retroactivamente
 * bellotas por actividad histórica a las cuentas veteranas, que es justo el
 * agujero que la época existe para tapar. Antes de aplicar esa migración a
 * producción: comprueba la fecha real de despliegue y actualiza este valor si
 * no coincide. Condición de despliegue documentada en
 * `docs/testing/2026-09-10-r5-verificacion.md`. */
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

// Las cuatro de pago son variaciones de la misma lámina del campamento (mismo
// roble, misma puerta centrada, mismo tercio inferior despejado): al cambiar de
// fondo se mueve la estación, no la escena. La procedencia de cada una está en
// `public/pet/scenes/provenance.json`.
export const CAMP_SCENES = [
  { id: "camp", price: 0, file: "camp-portrait.webp", width: 288, height: 384 },
  // 280x380 y no 288x384: la lámina del arroyo llegó con un marco casi blanco
  // del generador (4 px a los lados, 2 arriba y abajo) y se recorta, no se escala.
  { id: "creek", price: 100, file: "camp-creek.webp", width: 280, height: 380 },
  { id: "autumn", price: 150, file: "camp-autumn.webp", width: 288, height: 384 },
  { id: "night", price: 150, file: "camp-night.webp", width: 288, height: 384 },
  { id: "snow", price: 150, file: "camp-snow.webp", width: 288, height: 384 },
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
