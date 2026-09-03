# Mascota: arte pixel con PixelLab (herramienta por defecto y pipeline)

> **[Canónico · verificado 2026-09-03]** Cómo se genera el arte de la mascota (y de BiblioPlay)
> con PixelLab. Es el «brief de IA» que la spec de fase 1
> (`2026-09-02-mascota-rpg-design.md`, §5) dejaba pendiente, más lo aprendido en la prueba del
> 2026-09-03 (issue #1021). Si el pipeline cambia, se cambia aquí y se actualiza la fecha.

## 1. Decisión

**PixelLab (MCP `pixellab`) es la herramienta por defecto para todo sprite del proyecto.**
Suscripción Tier 2 «Pixel Artisan» (5 000 generaciones/mes, se renuevan el día 3). El agente
`.claude/agents/pet-artist.md` la usa; los scripts de apoyo viven en `scripts/pet-pixellab/`.
Los sprites procedurales (`scripts/pet-sprites.mjs`, `scripts/pet-badges.mjs`) **siguen siendo el
esqueleto**: fijan posición, pivotes y máscaras, y son el `init_image` de cada generación. El arte
IA los sustituye en `public/pet/` **con los mismos nombres** (`manifest.test.ts` vigila).

Se descartó dibujar a mano (no hay ilustrador) y generar con un modelo genérico (sin control de
lienzo ni de transparencia; PixelLab devuelve 40×40 exactos con alpha).

## 2. Coste por herramienta (lo que importa al decidir)

| Herramienta | Coste | Para qué la usamos |
|---|---|---|
| `create_image_pixflux` (img2img) | 1 gen | Todo el pipeline base: sprite plano por etapa, refinado de capas |
| `create_image_pixen` (texto) | 1 gen | Exploración de look; sin control de posición |
| `reduce_colors`, `correct_pixelart` | 0,1 gen | Paleta común de una tanda, limpieza |
| `edit_image` | 20-40 gens | Añadir prenda/objeto a la ardilla desnuda IA (capas de clase) |
| `inpaint_image` | 20-40 gens | Caras: regenerar solo la zona de los ojos |
| `create_image_pro` | 20-40 gens | Candidatos en lote cuando el look no convence |

Con 5 000 gens/mes cabe el arte completo varias veces; aun así, cada tanda apunta lo gastado.

## 3. Pipeline por etapa

Lienzo 40×40, `no_background: true`, `outline: single color black outline`, `shading: basic`,
`view: side`, **misma `seed` en toda la tanda** (la prueba usó 11).

1. **Ardilla desnuda de la etapa.** `node scripts/pet-pixellab/compose.mjs <stage> none none src.png`
   → `create_image_pixflux(init_image=src.png, init_image_strength=150, description=<brief §5>)`.
   A 150 respeta composición y pivotes aproximados y redibuja con calidad. Guardar como
   `nude_<stage>.png`.
2. **Trocear en piezas del rig.** `node scripts/pet-pixellab/slice.mjs nude_<stage>.png <stage> out/`
   → `tail/body/head/hand.png`. Usa los alphas procedurales dilatados 2 px como máscaras por orden
   z (mano > cabeza > cuerpo > cola). La recomposición es idéntica al plano.
3. **Capas de clase (×6).** Dos vías, comparar y quedarse con la mejor:
   - *Barata (probada):* componer `nude` + `outfit.png` + `accessory.png` procedurales
     (`rig.mjs`), pasar a `pixflux` a **fuerza 200** con «keep the squirrel exactly as is, only
     refine the hat and staff», y extraer cada capa con
     `extract-layer.mjs nude.png edited.png <prenda procedural>.png out.png 2 60`.
   - *Cara (pendiente de probar con suscripción):* `edit_image(nude.png, "add a blue wizard hat
     with gold stars and a wooden staff with a purple crystal in the left paw")` y extraer igual.
4. **Caras (×5, comunes).** La ardilla IA trae ojos. Pintar a mano las cinco caras sobre la cabeza
   IA (~20 px) o `inpaint_image` sobre el rectángulo de los ojos con la descripción del humor.
   Nunca superponer `face/*.png` procedural sobre cabeza IA: doble ojos.
5. **Paleta común.** `reduce_colors` con **todas** las piezas de la tanda en una sola llamada
   (quantizar una a una desalinea colores entre piezas).
6. **Comprobar.** `rig.mjs` para recomponer, `sheet.mjs` para la hoja de contacto, copiar a
   `public/pet/` con los nombres del manifiesto, `npx vitest run src/lib/pet`, mirar `/mascota`.

## 4. Lo que NO funciona (probado el 2026-09-03, no repetir)

- **Piezas aisladas desde el procedural** («only the head of a squirrel»): a fuerza 220 devuelve el
  procedural intacto; a 120 la cabeza pasa pero la cola sale sucia. Sin contexto se pierde.
- **Instrucciones de añadir cosas a fuerza ≥ 250** («now wearing a hat», «eyes closed»): las
  ignora y devuelve la misma ardilla. Por debajo de 150 añade pero mueve todo.
- **Diferencia píxel a píxel** entre dos generaciones: casi todo difiere. Extraer capas exige
  máscara (alpha del procedural dilatado) más tolerancia de color (60).

## 5. Brief por pieza (prompts base)

Prefijo común: `cute chibi red squirrel mascot facing front, big fluffy tail on the right, cream
belly, pixel art, black outline, flat shading, warm palette`.

| Pieza | Añadir al prefijo |
|---|---|
| Cría | `baby … with oversized head and tiny body, small fluffy tail` |
| Adulta | prefijo tal cual, `neutral expression`, `no clothes, no items` |
| Veterana | `old veteran …, tail with grey white streaks of age, small scar over one eyebrow` |
| Mago | `wearing a blue pointed wizard hat with gold stars, holding a thin wooden staff with a purple crystal` |
| Bárbaro | `wearing a grey iron horned helmet, holding a small iron mace` |
| Guerrero | `wearing a steel helmet with a red plume, holding a short sword` |
| Clérigo | `wearing a white tabard with a gold cross over the torso, holding a small wooden holy symbol` |
| Bardo | `wearing a green feathered cap, holding a small lute` |
| Explorador | `wearing a green hood, holding a short bow` |
| Caras | `sleepy: both eyes closed as thin curved lines, small yawning mouth` · `sad: downturned eyes and mouth` · `happy: big open eyes, wide smile` · `blink: eyes closed as flat lines` |

Bellota (`acorn.png`) e insignias (`badges/*.png`): `pixen` o `pixflux` desde el procedural a
fuerza 150, mismo lienzo.

## 6. Trampas

- ESM no lee `NODE_PATH`; los scripts viven dentro del repo para importar `sharp` sin trucos.
- La URL `…/mcp/images/<job>/download` tarda unos segundos en existir tras `completed`: reintentar.
- Sin `no_background: true` PixelLab mete fondo opaco.
- `init_image_strength` es «cuánto se conserva» (al revés que la mayoría de APIs img2img).
- Los candidatos y hojas de contacto van a `.superpowers/brainstorm/<fecha>/` (ignorado por git);
  a `public/pet/` solo va lo elegido.

## 7. Estado

- 2026-09-03: prueba con 28 gens del trial (adulta/cría/veterana desnudas, mago híbrido). Resultados
  en `.superpowers/brainstorm/pixellab-2026-09-03/` (local). Suscripción Tier 2 contratada el mismo
  día. Generación del arte completo: issue #1021.
