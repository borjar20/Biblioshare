import type { ItemType } from "@/lib/catalog/types";

// Vocabulario de «tipo de lanzamiento» POR MEDIO. En TS a propósito: config
// guarda el string y añadir un valor no toca la BD (spec §4.2). Las etiquetas
// viven en messages/es.json bajo la clave labelKey.
export const RELEASE_TYPES: Record<
  ItemType,
  ReadonlyArray<{ value: string; labelKey: string }>
> = {
  book: [
    { value: "publicacion", labelKey: "releaseType_publicacion" },
    { value: "tapa_dura", labelKey: "releaseType_tapa_dura" },
    { value: "bolsillo", labelKey: "releaseType_bolsillo" },
    { value: "ebook", labelKey: "releaseType_ebook" },
    { value: "audiolibro", labelKey: "releaseType_audiolibro" },
  ],
  movie: [
    { value: "cine", labelKey: "releaseType_cine" },
    { value: "streaming", labelKey: "releaseType_streaming" },
    { value: "fisico", labelKey: "releaseType_fisico" },
  ],
  series: [
    { value: "estreno_temporada", labelKey: "releaseType_estreno_temporada" },
    { value: "final_temporada", labelKey: "releaseType_final_temporada" },
    { value: "episodio", labelKey: "releaseType_episodio" },
    { value: "estreno", labelKey: "releaseType_estreno" },
  ],
};

// Plataforma de estreno (solo pantalla). Lista + «otro» (spec §4.2, nota del
// dueño 2026-08-09: Netflix/Amazon…).
export const PLATFORMS: ReadonlyArray<{ value: string; labelKey: string }> = [
  { value: "netflix", labelKey: "platform_netflix" },
  { value: "prime", labelKey: "platform_prime" },
  { value: "disney", labelKey: "platform_disney" },
  { value: "max", labelKey: "platform_max" },
  { value: "appletv", labelKey: "platform_appletv" },
  { value: "filmin", labelKey: "platform_filmin" },
  { value: "otro", labelKey: "platform_otro" },
];

export function isValidReleaseType(itemType: ItemType, value: string): boolean {
  return RELEASE_TYPES[itemType].some((r) => r.value === value);
}

/** La plataforma solo tiene sentido para pantalla (streaming): película y serie. */
export function platformAllowed(itemType: ItemType): boolean {
  return itemType === "movie" || itemType === "series";
}
