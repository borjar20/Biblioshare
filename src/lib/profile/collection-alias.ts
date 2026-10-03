import { ALL_TYPES_PARAM, resolveEffectiveType } from "@/lib/library/effective-type";

/** Destino del alias antiguo de la colección propia; los visitantes siguen en el perfil. */
export function getOwnCollectionAlias(
  isOwner: boolean,
  tab: string | undefined,
  typeParam: string | undefined,
): string | null {
  if (!isOwner || tab !== "coleccion") return null;
  // Sin intereses sólo resolvemos tipos explícitos. Ausente o inválido deja
  // que Biblioteca aplique su default; «todos» conserva la elección explícita.
  const type = typeParam === ALL_TYPES_PARAM
    ? ALL_TYPES_PARAM
    : resolveEffectiveType(typeParam, []);
  return type ? `/coleccion?type=${type}` : "/coleccion";
}
