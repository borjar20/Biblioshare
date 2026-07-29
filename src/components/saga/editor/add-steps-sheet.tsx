"use client";

import { useTranslations } from "next-intl";
import { SheetShell } from "../sheet-shell";
import { AddStepsList } from "./add-steps-list";
import type { RouteEditorItem } from "@/lib/sagas/hydrate-route-draft";

/** Hoja móvil del buscador de pasos (mockup M6). En escritorio el mismo
 *  contenido (`AddStepsList`) vive directo en el raíl, sin esta hoja
 *  (`shell-desktop.tsx`, mockup D2). */
export function AddStepsSheet({
  sagaName,
  palette,
  inDraftKeys,
  onAdd,
  onClose,
}: {
  sagaName: string;
  palette: RouteEditorItem[];
  inDraftKeys: Set<string>;
  onAdd: (item: RouteEditorItem) => void;
  onClose: () => void;
}) {
  const t = useTranslations("sagaEditor");
  return (
    <SheetShell title={t("routeAddSheetTitle")} caption={t("routeAddSheetCaption", { sagaName })} onClose={onClose}>
      <AddStepsList palette={palette} inDraftKeys={inDraftKeys} onAdd={onAdd} />
    </SheetShell>
  );
}
