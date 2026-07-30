import type { ItemType } from "@/lib/catalog/types";

// Valor centinela en la URL para «Todos los tipos» EXPLÍCITO. Hace falta porque
// la AUSENCIA de `type` significa «por defecto», y por defecto la biblioteca de
// «Todo» puede arrancar en el tipo preferido del onboarding (usuario con un
// único interés). Sin un valor distinguible, el pill «Todos los tipos»
// —que antes quitaba el `type`— era indistinguible del arranque y la página
// volvía a aplicar el preferido: el pill no tenía efecto. Ver issue #313.
export const ALL_TYPES_PARAM = "todos";

const TYPES: ItemType[] = ["book", "movie", "series"];

// itemType EFECTIVO de la biblioteca a partir del `?type=` de la URL y los
// intereses del onboarding. Única verdad de esa resolución (la usan la página y,
// vía el mismo valor, el filtro y la faceta):
//  - un tipo válido (book/movie/series) → ese tipo.
//  - el centinela «todos» → undefined EXPLÍCITO: el usuario pidió todos, el
//    preferido NO se aplica.
//  - ausente o basura → por defecto: si declaró exactamente un interés, arranca
//    ahí; con dos o tres (o ninguno) no fuerza ninguno (undefined = todos).
export function resolveEffectiveType(
  typeParam: string | undefined,
  interests: ItemType[],
): ItemType | undefined {
  if (typeParam && TYPES.includes(typeParam as ItemType)) {
    return typeParam as ItemType;
  }
  if (typeParam === ALL_TYPES_PARAM) return undefined;
  return interests.length === 1 ? interests[0] : undefined;
}
