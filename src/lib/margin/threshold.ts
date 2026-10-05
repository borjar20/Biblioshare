// Espejo exacto de private.margin_reached (20261004120200): si cambias uno,
// cambia el otro y los dos juegos de pruebas. El margen va SIEMPRE hacia atrás
// («llega tarde»): preferimos abrir unas páginas después a destripar nada.
export const MARGIN_MIN_RATIO = 0.03;
export const MARGIN_MIN_PAGES = 5;

export function marginUnlockRatio(noteRatio: number, readerPages: number): number {
  return noteRatio + Math.max(MARGIN_MIN_RATIO, MARGIN_MIN_PAGES / readerPages);
}

export function isRatioReached(
  readerPage: number,
  readerPages: number | null,
  noteRatio: number,
): boolean {
  if (!readerPages || readerPages <= 0) return false;
  const unlockPageNum = Math.ceil(marginUnlockRatio(noteRatio, readerPages) * readerPages - 1e-9);
  return readerPage >= unlockPageNum;
}

export function unlockPageHint(noteRatio: number, readerPages: number | null): number | null {
  if (!readerPages || readerPages <= 0) return null;
  const page = Math.ceil(marginUnlockRatio(noteRatio, readerPages) * readerPages - 1e-9);
  return page > readerPages ? null : page;
}
