export type DiaryEntry = {
  id: string;
  startedOn: string | null;
  // null = pase abierto: "lo estoy leyendo ahora mismo", todavía sin
  // terminar. Solo el diario propio del usuario debe mostrar estos pases;
  // el resto de la app (feed, comunidad, estadísticas...) los ignora.
  finishedOn: string | null;
  rating: number | null;
  review: string | null;
};
