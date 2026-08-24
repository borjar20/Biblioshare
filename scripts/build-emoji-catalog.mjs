// Genera src/lib/social/emoji-catalog.data.ts desde fuentes Unicode oficiales.
// NO es un paso de build: se ejecuta a mano cuando Unicode saca versión, y el
// fichero resultante se commitea. Así ni CI ni `next build` dependen de la red.
//
// Sale como .ts con el tipo ANOTADO y no como .json a propósito: importando un
// JSON de 1.900 entradas, TypeScript infiere el tipo literal de todo el fichero
// en cada typecheck. Con `: EmojiEntry[]` delante solo lo comprueba.
//
//   node scripts/build-emoji-catalog.mjs
//
// Fuentes:
//   - emoji-test.txt  -> qué emojis existen, grupo, y cuáles son fully-qualified.
//   - CLDR annotations es -> nombre y sinónimos en español.
import { writeFileSync } from "node:fs";

const EMOJI_TEST =
  "https://unicode.org/Public/emoji/16.0/emoji-test.txt";
const CLDR_ES =
  "https://raw.githubusercontent.com/unicode-org/cldr-json/main/cldr-json/cldr-annotations-full/annotations/es/annotations.json";
const CLDR_ES_DERIVED =
  "https://raw.githubusercontent.com/unicode-org/cldr-json/main/cldr-json/cldr-annotations-derived-full/annotationsDerived/es/annotations.json";

// El grupo "Component" (tonos de piel sueltos, pelo) no son emojis que nadie
// quiera poner como reacción. El resto va en este orden, que es el de la tira
// de categorías del selector.
const GROUPS = [
  "Smileys & Emotion",
  "People & Body",
  "Animals & Nature",
  "Food & Drink",
  "Travel & Places",
  "Activities",
  "Objects",
  "Symbols",
  "Flags",
];

async function getText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}
async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

const [testFile, cldr, cldrDerived] = await Promise.all([
  getText(EMOJI_TEST),
  getJson(CLDR_ES),
  getJson(CLDR_ES_DERIVED),
]);

const notes = {
  ...cldr.annotations.annotations,
  ...cldrDerived.annotationsDerived.annotations,
};

// Tonos de piel: 1F3FB..1F3FF. Se lista el emoji base y se descartan variantes.
const SKIN_TONE = /1F3F[B-F]/;

const out = [];
const seen = new Set();
let group = null;

for (const line of testFile.split(/\r?\n/)) {
  const groupLine = line.match(/^# group: (.+)$/);
  if (groupLine) {
    group = groupLine[1].trim();
    continue;
  }
  // 1F600 ; fully-qualified # 😀 E1.0 grinning face
  const m = line.match(/^([0-9A-F ]+);\s*fully-qualified\s*#\s*(\S+)\s+E[\d.]+\s+(.+)$/);
  if (!m) continue;
  const [, codepoints, emoji, englishName] = m;
  const g = GROUPS.indexOf(group);
  if (g === -1) continue; // Component u orden desconocido
  if (SKIN_TONE.test(codepoints)) continue;
  if (seen.has(emoji)) continue;
  seen.add(emoji);

  // CLDR nunca incluye el selector de variación U+FE0F en sus claves, pero
  // emoji-test.txt sí lo trae en la forma "fully-qualified" (❤️, 🕵️‍♂️...).
  // Sin esto, todo emoji con VS16 (una parte considerable: corazones,
  // profesiones con símbolo, banderas de mano...) no encuentra su anotación y
  // cae al nombre en inglés — se detectó porque emojiName("❤️") devolvía
  // "red heart" en vez de "corazón rojo".
  const note = notes[emoji.replace(/️/g, "")];
  const name = (note?.tts?.[0] ?? englishName).toLowerCase();
  const keywords = (note?.default ?? [])
    .map((k) => k.toLowerCase())
    .filter((k) => k !== name)
    .slice(0, 6);

  out.push({ e: emoji, n: name, k: keywords, g });
}

const file = `// GENERADO por scripts/build-emoji-catalog.mjs — no editar a mano.
// Regenerar: node scripts/build-emoji-catalog.mjs
import type { EmojiEntry } from "./emoji-catalog";

export const EMOJI_CATALOG_DATA: EmojiEntry[] = ${JSON.stringify(out)};
`;

writeFileSync(
  new URL("../src/lib/social/emoji-catalog.data.ts", import.meta.url),
  file,
  "utf8",
);
console.log(`emoji-catalog.data.ts: ${out.length} emojis en ${GROUPS.length} grupos`);
