// Clave de localStorage para recordar que a un pase ya se le preguntó "¿qué
// edición estás leyendo?" y el usuario contestó "No lo sé". Va por passId,
// no por itemId ni entryId: una relectura abre un pase nuevo con su propia
// clave, así que la pregunta debe volver a aparecer para ese pase.
export const editionAskedStorageKey = (passId: string) =>
  `biblioshare:edition-asked:${passId}`;
