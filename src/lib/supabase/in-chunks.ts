// Trocea las listas que van a un `.in(col, ids)` de PostgREST.
//
// POR QUÉ EXISTE (medido el 2026-08-12, ficha de persona): supabase-js manda el
// `.in()` como cadena de consulta —`?id=in.(uuid,uuid,…)`—, así que la longitud
// de la URL crece con el número de ids. Con ~226 UUIDs son ~8 KB de URL y la
// petición NO devuelve datos: `data` viene vacío, el error se traga y la
// pantalla enseña un "no hay nada" perfectamente convincente. Es el peor modo de
// fallo posible: no revienta, MIENTE.
//
// Y no se ve con datos pequeños. La ficha de una persona con 1 crédito se pinta
// bien; la de una con 226 sale vacía. Justo al revés de lo que uno probaría.
//
// 50 ids ≈ 1,9 KB de cadena de consulta, con margen de sobra bajo cualquier
// límite razonable de servidor o proxy.
export const IN_CHUNK_SIZE = 50;

export function chunkIds<T>(ids: T[], size: number = IN_CHUNK_SIZE): T[][] {
  if (ids.length <= size) return ids.length === 0 ? [] : [ids];
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}
