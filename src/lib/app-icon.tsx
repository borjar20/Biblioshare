// Icono de app: los tres lomos de la marca sobre terracota. Es la ruta que
// recomienda el handoff de marca frente al monograma "B" — dice "aquí cabe
// todo" sin palabras.
//
// Satori no resuelve CSS vars: los colores van en crudo. Ojo, NO son los
// --type-* de modo claro: sobre el terracota del fondo no contrastarían (el
// lomo de libro es casi del mismo tono). El mockup usa versiones aclaradas.
const ACCENT = "#b0542f";

// Proporciones y colores tomados del mockup (icono 120 → marca de 66 de alto,
// lomos de 18 de ancho y 9 de hueco; alturas 46 / 66 / 34).
const MARK_RATIO = 66 / 120;
const SPINE_WIDTH_RATIO = 18 / 66;
const GAP_RATIO = 9 / 66;

const SPINES = [
  { color: "#e8b06a", height: 46 / 66 }, // libro
  { color: "#7fc6c9", height: 66 / 66 }, // película
  { color: "#caa2d0", height: 34 / 66 }, // serie
];

// `monochrome`: variante para el badge de notificación de Android, que IGNORA
// los colores y se queda solo con el canal alfa. Si le pasas el icono normal,
// el terracota de fondo es opaco de punta a punta y en la barra de estado sale
// un cuadrado macizo, no la marca. Por eso: fondo transparente y lomos blancos
// (blanco por convención; da igual el color, solo cuenta que sea opaco).
export function AppIconMark({
  size,
  monochrome = false,
}: {
  size: number;
  monochrome?: boolean;
}) {
  const markHeight = size * MARK_RATIO;
  const spineWidth = markHeight * SPINE_WIDTH_RATIO;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        gap: markHeight * GAP_RATIO,
        background: monochrome ? "transparent" : ACCENT,
      }}
    >
      {SPINES.map((spine) => (
        <div
          key={spine.color}
          style={{
            width: spineWidth,
            height: markHeight * spine.height,
            borderRadius: spineWidth * 0.4,
            background: monochrome ? "#ffffff" : spine.color,
          }}
        />
      ))}
    </div>
  );
}
