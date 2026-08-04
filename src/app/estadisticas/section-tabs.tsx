"use client";

import { useEffect, useState } from "react";

/**
 * Índice de secciones del muro, con estado activo REAL.
 *
 * Antes eran siete enlaces del mismo color: decían a dónde se puede ir, pero no
 * dónde estás. Con siete secciones largas eso convierte el índice en una lista
 * de atajos en vez de en un mapa — y quien baja scrolleando pierde la cuenta.
 *
 * Se sigue con la POSICIÓN, no con el `hash`: pulsando un enlace el hash
 * acierta, pero al scrollear a mano se queda clavado en la última sección
 * pulsada y marca una que ya no se ve, que es peor que no marcar ninguna.
 *
 * Tampoco con `IntersectionObserver`, que es la respuesta de manual y aquí
 * falla en el borde que más se nota: **la última sección**. Con el margen
 * recortado por abajo (para que «la actual» sea la de arriba y no la que asoma
 * por el pie), la última nunca llega a cruzar esa línea si la página ya no
 * puede scrollear más — pulsas «Por categoría», la pantalla salta hasta el
 * final y el resaltado se queda en la anterior.
 *
 * La regla explícita es más corta y no tiene ese agujero: la última sección
 * cuyo borde superior haya pasado la línea de guardia, y si estamos al final del
 * documento, la última de todas.
 *
 * Es el único cliente de la página; el resto es servidor. Sin JS los enlaces
 * siguen funcionando (son anclas) y simplemente no se resalta ninguno.
 */
const GUARD = 140;

export function SectionTabs({
  sections,
}: {
  sections: { id: string; title: string }[];
}) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    function update() {
      const atBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 4;
      if (atBottom) {
        setActive(sections[sections.length - 1]?.id ?? null);
        return;
      }
      let current = sections[0]?.id ?? null;
      for (const s of sections) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= GUARD) current = s.id;
      }
      setActive(current);
    }

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [sections]);

  return (
    <nav
      aria-label="Secciones"
      className="mb-6 flex gap-5 overflow-x-auto border-b border-border"
    >
      {sections.map((s) => {
        const on = s.id === active;
        return (
          <a
            key={s.id}
            href={`#${s.id}`}
            aria-current={on ? "location" : undefined}
            className={`label-section border-b-2 pb-2.5 whitespace-nowrap transition-colors ${
              on
                ? "border-accent font-semibold text-accent"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {s.title}
          </a>
        );
      })}
    </nav>
  );
}
