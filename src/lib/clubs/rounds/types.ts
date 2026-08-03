import type { ItemType } from "@/lib/catalog/types";

/** Estado de la ronda del periodo actual, tal y como lo devuelve SQL.
 *  Ninguno de estos campos se calcula en el cliente: `periodKey` y `dayIndex`
 *  vienen del servidor porque la fecha del navegador miente (issue #271). */
export type RoundState = {
  /** Semana ISO en Europe/Madrid, p. ej. '2026-W32'. */
  periodKey: string;
  /** 1 = lunes … 7 = domingo. La consigna de la casa entra desde el 3. */
  dayIndex: number;
  /** A quién le toca proponer este periodo. */
  holderId: string | null;
  /** Nombre del titular, para el estado 02 («Esta semana le toca a Marta»). */
  holderName: string | null;
  /** La ronda ya escrita de este periodo, si existe. */
  round: {
    id: string;
    authorId: string | null;
    /** Nombre de quien propuso, para «{name} propuso la ronda» (estado 03).
     *  `null` si es una ronda de la casa (`authorId` también null) o si el
     *  autor no tiene perfil legible. */
    authorName: string | null;
    prompt: string;
    itemType: ItemType | null;
    itemId: string | null;
  } | null;
  /** La consigna de la casa PENDIENTE de materializar: solo trae texto
   *  cuando `round` es `null`, `dayIndex >= 3` y aún no ha respondido nadie
   *  (§2.4 de la spec). Lo calcula `get_club_round_state` en SQL -- ver su
   *  comentario -- porque `private.house_prompt()` no es invocable desde
   *  aquí (su `execute` está revocado para `authenticated` a propósito). */
  housePrompt: string | null;
};
