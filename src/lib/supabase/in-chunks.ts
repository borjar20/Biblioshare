// Trocea las listas que van a un `.in(col, ids)` de PostgREST.
//
// POR QUÉ EXISTE: supabase-js manda el `.in()` en la CADENA DE CONSULTA
// —`?id=in.(uuid,uuid,…)`—, así que la longitud de la URL crece con el número de
// ids. Una filmografía de 300 UUIDs son ~11 KB de URL, por encima del límite por
// defecto de bastantes servidores y proxies (8 KB es el valor típico). La
// hidratación de la ficha de persona puede llegar ahí sin esfuerzo.
//
// ⚠️ ES UNA MEDIDA PREVENTIVA, NO EL ARREGLO DE UN FALLO OBSERVADO. Al escribir
// esto se sospechó que la URL larga era la causa de que la ficha de una persona
// con 226 créditos saliera vacía, y **esa sospecha era falsa**: la causa real
// eran créditos HUÉRFANOS en dev (filas de `credits` apuntando a películas que
// ya no están en `movies`), y la consulta devolvía cero con 50 ids igual que con
// 226. No se ha medido ningún fallo por longitud de URL en este proyecto.
// Se conserva porque el riesgo es real y el coste de trocear es despreciable.
//
// 50 ids ≈ 1,9 KB de cadena de consulta, con margen de sobra bajo cualquier
// límite razonable.
export const IN_CHUNK_SIZE = 50;

export function chunkIds<T>(ids: T[], size: number = IN_CHUNK_SIZE): T[][] {
  if (ids.length <= size) return ids.length === 0 ? [] : [ids];
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}
