import Link from "next/link";
import { getTranslations } from "next-intl/server";

export type ClubTab = "feed" | "actividades" | "calendario" | "gestion";

export const CLUB_TABS: ClubTab[] = ["feed", "actividades", "calendario", "gestion"];

// El calendario es una RUTA propia (/club/[slug]/calendario), no un estado de la
// página del club: sus hermanas viven en `?tab=`, él no. Sin esta distinción la
// pestaña llevaría a `?tab=calendario`, que la página del club no sabe pintar.
// El componente tenía asumido que todas las pestañas eran lo primero.
function tabHref(basePath: string, tab: ClubTab): string {
  return tab === "calendario" ? `${basePath}/calendario` : `${basePath}?tab=${tab}`;
}

// El club era un scroll único con cabecera + gestión + actividades + feed
// apilados. Tres pestañas: cada una responde a una intención distinta.
export async function ClubTabs({
  active,
  basePath,
  canModerate,
  activityCount,
}: {
  active: ClubTab;
  basePath: string;
  canModerate: boolean;
  /** Nº de propuestas esperando moderación, para el aviso de la pestaña. */
  activityCount?: number;
}) {
  const t = await getTranslations("club.tabs");
  const tabs = canModerate ? CLUB_TABS : CLUB_TABS.filter((x) => x !== "gestion");

  // Con CUATRO pestañas (desde que el calendario es una, spec 2026-08-12) la
  // fila ya no cabe a 390 px en la vista de MODERADOR, que es la peor: suma
  // «Gestión» con su ◈ y el badge de propuestas. Sin contener el desbordamiento,
  // lo que se desliza es la PÁGINA ENTERA, que es el fallo que se reportó.
  //
  // Dos medidas, y hacen falta las dos:
  //   - Encoger (gap y tipo) para que quepan en el caso normal.
  //   - Contener el scroll en la propia barra (`-mx-4 px-4 overflow-x-auto`, el
  //     mismo truco de sangrado que ya usan los carruseles del club), para que
  //     la página no se mueva NUNCA -- ni con una etiqueta más larga de lo
  //     previsto, ni si algún día entra una quinta pestaña (issue #590).
  //
  // El borde inferior va en el hijo con `w-max min-w-full`: así abarca todo el
  // ancho aunque las pestañas no lo llenen (caso de quien no modera, tres) y
  // acompaña al contenido si lo desborda.
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <div className="flex w-max min-w-full gap-3 border-b border-border">
        {tabs.map((tab) => {
          const isActive = tab === active;
          return (
            <Link
              key={tab}
              href={tabHref(basePath, tab)}
              // `whitespace-nowrap` es obligatorio con el `w-max` del padre: sin
              // él una etiqueta puede partirse en dos líneas y descuadrar la
              // altura de la barra en vez de empujar a lo ancho.
              className={`-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-1 pt-2 pb-3 font-serif text-[14.5px] font-semibold whitespace-nowrap transition-colors ${
                isActive
                  ? "border-accent text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t(tab)}
              {tab === "actividades" && activityCount ? (
                <span className="grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] text-accent-foreground">
                  {activityCount}
                </span>
              ) : null}
              {/* La marca del handoff para lo que solo ven moderadores. */}
              {tab === "gestion" && (
                <span aria-hidden className="text-[8px] text-muted-foreground">
                  ◈
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
