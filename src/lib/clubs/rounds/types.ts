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
    prompt: string;
    itemType: ItemType | null;
    itemId: string | null;
  } | null;
};
