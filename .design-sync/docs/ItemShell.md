---
category: Pantallas
---

# ItemShell — la ficha de título completa

Esqueleto de pantalla, no un componente suelto: es el layout de la ficha de un
libro, película o serie. Úsalo como punto de partida cuando diseñes cualquier
pantalla de detalle de una obra, en vez de recomponer el hero a mano.

## La ficha son DOS pantallas, no una responsive

`ItemShell` pinta dos árboles y esconde cada uno en su breakpoint (`lg` = 1024px):

- **Móvil** (`lg:hidden`) → `ItemHero`: portada dentro del hero, barra superior
  con botón de volver, label de tipo centrado y píldora de estado.
- **PC** (`hidden lg:block`) → `ItemRail` (rail sticky de 300px con la portada
  grande y el panel de control) + `ItemHeaderWide` (cabecera de la columna
  derecha).

No es un hero que se estira: en PC **no existen** el botón de volver, el label
de tipo centrado ni la píldora de estado, la portada cambia de sitio, y el
byline pasa de mono 11px a serif 22px. Si diseñas una variante de esta pantalla,
respeta esa separación — no intentes unificar los dos árboles.

## Slots

Las pestañas y los controles entran como `ReactNode`, y se pintan **una sola
vez** (en PC caen en la columna derecha; en móvil, a lo ancho):

| Slot | Dónde aparece | Para qué |
|---|---|---|
| `tabs` | ambos | El cuerpo de la ficha: pestañas y su contenido. Obligatorio. |
| `railActions` | solo PC | Panel de control del pase bajo la portada del rail. |
| `statusSlot` | solo móvil | La píldora «En tu biblioteca · Leyendo». |
| `menuSlot` | solo móvil | El menú ⋯ de la barra del hero. |

## Props de datos

`itemType` (`"book" | "movie" | "series"`) elige el acento de tipo de toda la
pantalla — el rail, los iconos y la cabecera lo leen de `MEDIA_ACCENT`. El resto
son texto ya formateado por quien llama: `ratingsLabel` **incluye la cuenta**
(«1.284 valoraciones»), no un número aparte. `byline`, `coverUrl` y `avgRating`
aceptan `null` y la pantalla se adapta sola.

## Composición típica

```jsx
<Biblioshare.ItemShell
  itemType="book"
  mediaLabel="Libro"
  title="El nombre del viento"
  byline="Patrick Rothfuss"
  genres={["Fantasía", "Aventura"]}
  coverUrl={cover}
  avgRating={8.4}
  ratingsLabel="1.284 valoraciones"
  backLabel="Volver"
  railActions={<Biblioshare.Button>Seguir leyendo</Biblioshare.Button>}
  tabs={<TusPestañas />}
/>
```
