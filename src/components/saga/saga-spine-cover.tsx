import { SAGA_ACCENT, type SagaAccentToken } from "@/lib/sagas/accents";

// Cuatro lomos de anchos distintos, como en la maqueta: se lee como libros
// puestos de canto, no como un cuadrado roto.
const SPINE_FLEX = [1, 1.5, 0.8, 1.2];
// Cada lomo mezcla el acento con el papel en distinta proporción para que la
// pila tenga relieve sin necesitar cuatro colores distintos. Se mezcla contra
// `--surface` y NO contra blanco: en tema oscuro el blanco dejaba los cuatro
// lomos igual de lavados y la pila se leía como un rectángulo con rayas.
const SPINE_MIX = [70, 45, 88, 32];

/** Primera letra REAL del nombre: los nombres curados con prefijo entre
 *  corchetes («[QA] Universo») dan una inicial «[» que no identifica nada. */
function initialOf(name: string): string {
  const letter = [...name].find((c) => /\p{L}|\p{N}/u.test(c));
  return (letter ?? "?").toUpperCase();
}

/**
 * Portada de una saga SIN imagen (decisión 2 del rediseño «Explorar sagas»:
 * «sin portada ≠ sin identidad»). Antes era un rectángulo de color plano —
 * un bloque mudo que no distinguía una saga de otra. Ahora se genera del
 * acento de la saga: pila de lomos + inicial en serif.
 *
 * Decorativa por completo (`aria-hidden`): la inicial no aporta nada que el
 * nombre de la saga, que va justo al lado, no diga ya.
 */
export function SagaSpineCover({
  name,
  accent,
  className = "",
}: {
  name: string;
  accent: SagaAccentToken;
  className?: string;
}) {
  const initial = initialOf(name);
  const color = SAGA_ACCENT[accent].cssVar;

  return (
    <span
      aria-hidden
      className={`relative flex shrink-0 gap-px overflow-hidden rounded-md ${className}`}
      style={{ background: `color-mix(in oklab, ${color} 22%, var(--surface-muted))` }}
    >
      {SPINE_FLEX.map((flex, i) => (
        <span
          key={i}
          className="h-full"
          style={{
            flex,
            background: `color-mix(in oklab, ${color} ${SPINE_MIX[i]}%, var(--surface))`,
          }}
        />
      ))}
      <span className="absolute inset-0 grid place-items-center font-serif font-semibold text-[19px] text-white/90 [text-shadow:0_1px_3px_rgba(40,25,10,.4)]">
        {initial}
      </span>
    </span>
  );
}
