import type { ItemType } from "@/lib/catalog/types";

// Roles de una persona sobre un ítem. `cast` = reparto; el resto son "equipo".
// `author` es el rol para libros (Open Library); el resto vienen de TMDB.
export type CreditRole = "cast" | "director" | "writer" | "creator" | "author";

export type Credit = {
  id: string; // people.id
  name: string;
  photoUrl: string | null;
  role: CreditRole;
  character: string | null;
};

// Reparto y equipo de un ítem, ya separados para pintar la ficha.
export type ItemCredits = {
  cast: Credit[];
  crew: Credit[]; // director / writer / creator / author
};

export type Person = {
  id: string;
  name: string;
  photoUrl: string | null;
  bio: string | null;
  birthDate: string | null;
  deathDate: string | null;
  placeOfBirth: string | null;
};

// Un trabajo de una persona presente en nuestro catálogo (para "Su obra").
export type PersonWork = {
  itemType: ItemType;
  itemId: string;
  title: string;
  coverUrl: string | null;
  href: string;
  role: CreditRole;
  character: string | null;
};
