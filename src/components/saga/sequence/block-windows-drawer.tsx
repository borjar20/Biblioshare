"use client";

import { useTranslations } from "next-intl";
import type { DraftAnchor, NestedSubject } from "@/lib/sagas/sequence-draft";
import type { WindowReason } from "@/lib/sagas/types";
import { WindowEditor } from "./window-editor";

/** Cajón bajo la fila de un bloque (fase 4): las ventanas de las obras `libre`
 *  de esa subsaga, curadas SIN salir del editor del padre. Es lo que pidió el
 *  responsable: «dentro de las Novelas secretas me gustaría poner a El Hombre
 *  Iluminado en una ventana dentro del Cosmere».
 *
 *  Y es lo único de la hija que se toca desde aquí: la #187 sigue cerrada, así
 *  que el bloque no se despliega para mover, renumerar ni marcar opcional sus
 *  obras — para eso está su enlace «Abrir su editor».
 *
 *  Si la obra ya tiene ventana curada desde su propia saga, el cajón la ENSEÑA y
 *  deja editarla ahí mismo. No es cosmético: al enseñarla, el borrador la lleva,
 *  y al guardar el padre la reemite en vez de borrarla. */
export function BlockWindowsDrawer({
  childSagaId, nested, anchors, onSetAnchor, onClearAnchor, onSetReason,
}: {
  childSagaId: string;
  /** Todos los sujetos anidados del borrador; el cajón filtra los suyos. */
  nested: NestedSubject[];
  anchors: DraftAnchor[];
  onSetAnchor: (key: string, side: "after" | "before", anchor: DraftAnchor) => void;
  onClearAnchor: (key: string, side: "after" | "before") => void;
  onSetReason: (key: string, reason: WindowReason | null) => void;
}) {
  const t = useTranslations("sagaEditor");
  const subjects = nested.filter((n) => n.childSagaId === childSagaId);

  return (
    <details className="mt-1.5 rounded-xl border border-dashed border-border px-2.5 py-2">
      <summary className="cursor-pointer text-[11.5px] font-semibold text-muted-foreground">
        {t("blockWindowsSummary", { count: subjects.length })}
      </summary>
      {subjects.length === 0 ? (
        <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">{t("blockWindowsEmpty")}</p>
      ) : (
        <ul className="mt-2 grid gap-2">
          {subjects.map((n) => (
            <li key={n.key} className="rounded-lg border border-border bg-surface px-2.5 py-2">
              <p className="truncate font-serif text-[12.5px] font-semibold leading-tight">{n.title}</p>
              <WindowEditor
                subject={n}
                anchors={anchors}
                onSetAnchor={(side, anchor) => onSetAnchor(n.key, side, anchor)}
                onClearAnchor={(side) => onClearAnchor(n.key, side)}
                onSetReason={(reason) => onSetReason(n.key, reason)}
              />
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
