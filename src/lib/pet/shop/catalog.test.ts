import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACORN_EPOCH, ACORN_RATES, CAMP_SCENES, DEFAULT_SCENE_ID, isCampSceneId, scenePrice } from "./catalog";

// No hay `sharp` ni `image-size` entre las dependencias del proyecto y esta
// tarea no debe añadir ninguna solo para leer dos enteros de una cabecera.
// El formato WebP expone ancho/alto en los primeros bytes del fichero, así
// que basta un parser mínimo de la cabecera — vive aquí, en el test, porque
// no es código de producción: solo sirve para comprobar que `catalog.ts` no
// miente sobre el tamaño nativo del PNG/WebP que sirve de fondo.
interface WebpDims {
  width: number;
  height: number;
}

function readWebpDimensions(path: URL, label: string): WebpDims {
  const buf = readFileSync(path);
  if (buf.length < 30 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") {
    throw new Error(`${label}: no es un WebP válido (falta cabecera RIFF/WEBP)`);
  }
  const fourCc = buf.toString("ascii", 12, 16);

  if (fourCc === "VP8L") {
    // Lossless: byte de firma 0x2f y luego 14 bits de ancho-1 + 14 bits de
    // alto-1 empaquetados little-endian en los 4 bytes siguientes.
    if (buf[20] !== 0x2f) throw new Error(`${label}: cabecera VP8L sin firma 0x2f`);
    const bits = buf[21] | (buf[22] << 8) | (buf[23] << 16) | (buf[24] << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }

  if (fourCc === "VP8X") {
    // Extendido: ancho-1 y alto-1 en 24 bits cada uno, a partir del byte 24.
    const width = (buf[24] | (buf[25] << 8) | (buf[26] << 16)) + 1;
    const height = (buf[27] | (buf[28] << 8) | (buf[29] << 16)) + 1;
    return { width, height };
  }

  if (fourCc === "VP8 ") {
    // Con pérdida: tras la cabecera de trama (3 bytes) viene un código de
    // inicio de 3 bytes (0x9d 0x01 0x2a) y luego ancho/alto en 14 bits cada
    // uno, little-endian, con 2 bits altos de escala que se descartan.
    const start = 20;
    if (buf[start + 3] !== 0x9d || buf[start + 4] !== 0x01 || buf[start + 5] !== 0x2a) {
      throw new Error(`${label}: cabecera VP8 sin código de inicio 0x9d012a`);
    }
    const width = (buf[start + 6] | (buf[start + 7] << 8)) & 0x3fff;
    const height = (buf[start + 8] | (buf[start + 9] << 8)) & 0x3fff;
    return { width, height };
  }

  // Cualquier otra variante (o una cabecera corrupta) debe hacer FALLAR el
  // test con un mensaje claro, no colarse como si el tamaño fuera correcto.
  throw new Error(`${label}: variante WebP no soportada por este parser ("${fourCc}")`);
}

// Cada escena sirve DOS láminas: la vertical en móvil y la apaisada a partir de
// 900 px. Las dos son ficheros distintos con tamaños distintos, así que todo lo
// que se comprueba de una hay que comprobarlo de la otra: una apaisada que
// falte o que mienta sobre su talla sale igual de rota en escritorio que una
// vertical rota en móvil, y hasta ahora el test solo miraba la vertical.
function laminasDe(scene: (typeof CAMP_SCENES)[number]) {
  return [
    { etiqueta: `${scene.id} vertical`, file: scene.file, width: scene.width, height: scene.height },
    { etiqueta: `${scene.id} apaisada`, file: scene.wide.file, width: scene.wide.width, height: scene.wide.height },
  ];
}

function todasLasLaminas() {
  return CAMP_SCENES.flatMap(laminasDe);
}

describe("catálogo de la tienda", () => {
  it("tiene la escena de siempre gratis y cuatro de pago", () => {
    expect(CAMP_SCENES[0].id).toBe(DEFAULT_SCENE_ID);
    expect(scenePrice(DEFAULT_SCENE_ID)).toBe(0);
    expect(CAMP_SCENES.filter(scene => scene.price > 0)).toHaveLength(4);
    // Fija los precios exactos en orden: camp, creek, autumn, night, snow
    expect(CAMP_SCENES.map(s => [s.id, s.price])).toEqual([
      ["camp", 0],
      ["creek", 100],
      ["autumn", 150],
      ["night", 150],
      ["snow", 150],
    ]);
  });
  it("cuesta una semana de uso normal llegar al primero", () => {
    // ~90 bellotas/semana con la calibración de la spec §3.
    const semana = ACORN_RATES.day * 4 + ACORN_RATES.mission * 6 + ACORN_RATES.achievement;
    expect(semana).toBeGreaterThanOrEqual(90);
    expect(scenePrice("creek")).toBeLessThanOrEqual(semana + ACORN_RATES.welcome);
  });
  it("no acepta ids inventados", () => {
    expect(isCampSceneId("creek")).toBe(true);
    expect(isCampSceneId("../../etc/passwd")).toBe(false);
    expect(() => scenePrice("no-existe")).toThrow();
  });
  it("fija la época en una fecha ISO", () => {
    expect(ACORN_EPOCH).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  // Un `file` que no existe en disco no rompe nada en test ni en build: sale en
  // producción como un rectángulo verde vacío detrás de la ardilla. Y cada
  // escena declara su tamaño NATIVO, del que depende la escala entera del CSS.
  it("las dos láminas de cada escena existen en disco", () => {
    for (const lamina of todasLasLaminas()) {
      const stat = statSync(new URL(`../../../../public/pet/scenes/${lamina.file}`, import.meta.url));
      expect(stat.size, `${lamina.etiqueta} → ${lamina.file}`).toBeGreaterThan(0);
    }
  });
  it("no reutiliza el mismo fichero en dos láminas", () => {
    // Mientras faltó el arte, las cuatro de pago apuntaban a `camp-portrait.webp`
    // en vertical y a `camp.webp` en apaisado: se compraba una escena y salía la
    // de siempre. Ni un fichero repetido entre las diez láminas.
    const files = todasLasLaminas().map(lamina => lamina.file);
    expect(new Set(files).size).toBe(files.length);
  });
  it("cada escena declara su apaisada, y es apaisada de verdad", () => {
    for (const scene of CAMP_SCENES) {
      expect(scene.wide.file, scene.id).toMatch(/\.webp$/);
      // Si el ancho no supera al alto, alguien ha copiado la vertical en el
      // campo `wide` y el fondo de escritorio vuelve a ser una tira estrecha.
      expect(scene.wide.width, `${scene.id} apaisada`).toBeGreaterThan(scene.wide.height);
      expect(scene.wide.width, `${scene.id} apaisada`).toBeGreaterThan(scene.width);
    }
  });
  // `width`/`height` no son metadatos decorativos: fijan la escala de píxel
  // ENTERA con la que se sirve el fondo (regla estética del rediseño RPG,
  // nada de `cover` ni reescalado). Si alguien cambia un número a mano, o
  // sustituye el .webp por otro de otra talla, esto tiene que fallar aquí y
  // no como un fondo borroso en producción.
  it("las dimensiones declaradas coinciden con las reales del WebP", () => {
    for (const lamina of todasLasLaminas()) {
      const path = new URL(`../../../../public/pet/scenes/${lamina.file}`, import.meta.url);
      const real = readWebpDimensions(path, `${lamina.etiqueta} → ${lamina.file}`);
      expect(real, `${lamina.etiqueta} → ${lamina.file}`).toEqual({ width: lamina.width, height: lamina.height });
    }
  });
});
