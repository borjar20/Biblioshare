import type { SagaItemRole } from "./roles";

/** Glifo de cada rol, tomado del mockup «Paper - Sagas (estados del grafo)».
 *
 *  Solo glifo, no color, y a propósito: en este producto el color YA significa
 *  subsaga —`SAGA_ACCENT` tiñe el raíl, el punto del timeline y la leyenda del
 *  mapa—, así que un chip de rol con hue propio se leería como «esta obra es de
 *  otro grupo». El mockup pinta seis colores; se descarta a sabiendas. Si algún
 *  día se quiere color por rol, primero hay que decidir qué hacer con el acento
 *  de subsaga, no añadir una segunda paleta encima.
 *
 *  `Record<SagaItemRole, string>` sin caso por defecto, por el mismo motivo por
 *  el que `RoleChip` no lo tiene: un rol nuevo sin glifo tiene que romper la
 *  compilación, no caer en un genérico que lo esconda. */
export const ROLE_GLYPH: Record<SagaItemRole, string> = {
  precuela: "◂",
  novela_corta: "▪",
  relato: "✦",
  spin_off: "↳",
  companero: "▤",
  crossover: "◈",
};
