// Un "pase" es una lectura o un visionado: el dueño de la nota y la reseña.
// El usuario nunca lo crea a mano, lo abre y lo cierra el cambio de estado
// del ítem (ver transitions.ts). `finishedOn` nullable = pase abierto.
export type Pass = {
  id: string;
  startedOn: string | null;
  finishedOn: string | null;
  // Nota SIEMPRE entera 1-10; la escala de estrellas es solo presentación.
  rating: number | null;
  review: string | null;
  isPublic: boolean;
  editionId: string | null;
};
