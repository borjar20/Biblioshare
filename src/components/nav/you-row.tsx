import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { youItems } from "./nav-items";

// La cara móvil de «Tú» (F4-007). En sm+ esta lista es el menú del avatar de la
// topbar (UserMenu); en móvil no hay avatar en la topbar y la entrada a lo tuyo
// es la pestaña Perfil de la barra inferior, así que la lista se despliega aquí,
// en tu propio perfil, como una fila de accesos.
//
// Por eso es `sm:hidden`: en escritorio serían los MISMOS cuatro destinos dos
// dedos por debajo del menú que ya los tiene. Redundar en la misma pantalla no
// es descubribilidad, es ruido; lo que hacía falta era que en cada viewport
// hubiera UN camino, no ninguno.
//
// «Mi perfil» se cae de la fila por lo obvio: es la pantalla en la que estás.
export async function YouRow({ username }: { username: string }) {
  const t = await getTranslations("nav.you");
  const items = youItems(username).filter((item) => item.key !== "profile");

  return (
    <nav
      aria-label={t("rowLabel")}
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:hidden"
    >
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          // `min-h-[44px]` y no `tap-44`: la utilidad agranda el área con un
          // `::after` que SOLO existe bajo `pointer: coarse`, así que lo que se
          // ve sigue midiendo 37px y no se puede comprobar midiendo la caja.
          // Estos chips son navegación primaria en móvil y no hay nada que
          // apretar al lado: que midan 44 de verdad es más barato que
          // explicarle a nadie por qué el dibujo y el área no coinciden.
          className="flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border border-border bg-surface px-3.5 text-[13px] font-medium text-foreground transition-colors hover:bg-surface-muted"
        >
          <item.Icon className="h-4 w-4 text-muted-foreground" />
          {t(item.labelKey)}
        </Link>
      ))}
    </nav>
  );
}
