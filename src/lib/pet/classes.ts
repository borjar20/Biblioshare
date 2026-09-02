// Seis clases clásicas ↔ seis atributos (spec §2). El ORDEN de PET_CLASSES es
// el orden de desempate de suggestClass (primera de la tabla de la spec gana).
export const PET_CLASSES = [
  "barbarian",
  "fighter",
  "wizard",
  "cleric",
  "bard",
  "ranger",
] as const;
export type PetClass = (typeof PET_CLASSES)[number];

export const PET_ATTRIBUTES = ["FUE", "CON", "INT", "SAB", "CAR", "DES"] as const;
export type PetAttribute = (typeof PET_ATTRIBUTES)[number];

export type PetAttributes = Record<PetAttribute, number>;

export const CLASS_PRIMARY: Record<PetClass, PetAttribute> = {
  barbarian: "FUE",
  fighter: "CON",
  wizard: "INT",
  cleric: "SAB",
  bard: "CAR",
  ranger: "DES",
};

export type PetStage = "acorn" | "young" | "adult" | "veteran";
export type PetMood = "happy" | "neutral" | "sleepy" | "sad";

export function isPetClass(x: unknown): x is PetClass {
  return typeof x === "string" && (PET_CLASSES as readonly string[]).includes(x);
}

// Espejo del CHECK de BD (char_length entre 1 y 24). Vive aquí y no en
// actions.ts: ese módulo es "use server" y solo puede exportar funciones
// async — una constante ahí rompe la build (server actions must be async).
export const NAME_MAX = 24;
