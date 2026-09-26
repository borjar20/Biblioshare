# Prueba: arte de la mascota dibujado por código

> [Histórico · congelado 2026-09-26] Experimento de comparación, **no conectado a la app**.
> El arte de producción sigue siendo PixelLab (`docs/superpowers/specs/2026-09-03-mascota-arte-pixellab-design.md`).

Motor de pixel art sin IA ni imágenes de entrada, escrito para comparar con lo que sirve
`public/pet/`. Genera, de forma determinista y con una paleta compartida:

- `art/engine.js` — primitivas (elipse, cápsula, tubo, polígono), relleno con rampa de 4 tonos
  y sombreado por forma (luz arriba-izquierda), contorno selectivo, tramado Bayer, ruido.
- `art/pet.js` — la ardilla: 3 etapas × 6 clases × 7 animaciones (`idle`, `sleepy`, `sad`,
  `joy`, `attack`, `hurt`, `ko`), celda 80 px, más la bellota. La cabeza está pintada a mano
  (rejilla `HEAD` de 27×20) con ojos, cejas y boca como sellos por expresión; cuerpo, cola y ropa
  son formas sombreadas. Cada frame sale de una pose numérica.
- `art/world.js` — fondos procedurales a cualquier tamaño (campamento, claro de combate,
  madriguera) con animación y hora del día; enemigos `caparazon` y `brote`.
- `art/items.js` — botín (32 px), efectos de combate (9 frames), insignias y UI nine-slice.

Construir la demo comparativa (HTML que carga los assets reales de PixelLab desde `pl/`):

```sh
npx -y -p sharp node scripts/pet-art-code/build-demo.cjs   # o con sharp instalado a mano
# -> scripts/pet-art-code/out/mascota-a-mano.html + out/files.json (mapa pl/... -> public/pet/...)
```

Los ficheros de `art/` funcionan igual en navegador (`window.ART`) y en Node (`globalThis.ART`).

## `estilos/`: exploración de estilo (vectorial + pixel)

Tercer intento, tras descartar la ardilla chibi: una sola geometría vectorial dibujada a mano
(`squirrel.js`, proporción adulta y mirada con carácter) con cuatro tratamientos en `styles.js`
(bestiario de libro, folk/grabado, anime de aventuras, cómic europeo). `pixel.js` baja cada
lámina a 128 px cuantizando a la paleta del estilo. `board-template.html` es el tablero: se
construye sustituyendo `/*CODE*/` por los tres ficheros concatenados.
