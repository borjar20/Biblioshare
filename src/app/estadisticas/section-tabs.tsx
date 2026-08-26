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
    // PEGADO bajo la cabecera de la app (`--topbar-h`), como las pestañas de la
    // ficha. Un índice que se va con el scroll es un índice que solo sirve una
    // vez: en cuanto bajas a «Valoraciones» hay que subir arriba del todo para
    // saltar a otra sección, y con siete secciones largas eso es medio muro de
    // vuelta. Pegado, además, el resaltado deja de ser decorativo — dice dónde
    // estás MIENTRAS scrolleas, que es cuando hace falta.
    //
    // `-mx-4 px-4` y sus variantes deshacen el padding lateral del contenedor de
    // la página (era un `<main>` hasta que el landmark subió al armazón, #816): sin
    // eso el fondo del índice acaba antes que el borde de la pantalla y las
    // tarjetas se ven pasar por los lados al scrollear.
    // `z-10` lo deja por debajo de la cabecera (que es `z-20`).
    <nav
      aria-label="Secciones"
      // `pt-3` es del NAV y no de cada enlace: el subrayado del activo tiene que
      // seguir pegado al borde inferior. Sin él, las letras nacían a ras de la
      // cabecera de la app —dos franjas pegadas sin aire entre ellas— y el
      // índice se leía como parte de la barra de arriba.
      className="sticky top-[var(--topbar-h)] z-10 mb-6 -mx-4 flex gap-5 overflow-x-auto border-b border-border bg-background/90 px-4 pt-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
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
