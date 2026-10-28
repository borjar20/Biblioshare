"use client";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { parseItemKey } from "@/lib/sagas/derive-map";
import type { AtlasWork } from "@/lib/sagas/atlas/model";
import { skipOptional, unskipOptional } from "@/lib/sagas/optional-actions";
import styles from "./atlas.module.css";

// «Saltar» / «Deshacer» de una opcional en el atlas (mini-ficha y lista). Mismo `<form action>`
// que el del antiguo timeline de «Cómo leerla» (retirado con el atlas), pero con la
// `AtlasWork`. Quien lo pinta decide si hay sesión y si la obra es opcional.
//
// El par (tipo, id) sale de la clave con `parseItemKey`; la saga que se GUARDA es
// `work.ownerSagaId` (la dueña de la fila de `saga_items`), y `sagaId` solo dice qué ficha
// revalidar (optional-actions.ts; `revalidateSagaPage` ya incluye `/mapa`).
export function SkipOptionalButton({ sagaId, work }: { sagaId: string; work: AtlasWork }) {
  const item = parseItemKey(work.key);
  if (item === null || !work.ownerSagaId) return null;
  const act = work.skipped ? unskipOptional : skipOptional;
  return (
    <form action={act.bind(null, sagaId, work.ownerSagaId, item.itemType, item.itemId)} className={styles.skipForm}>
      <SkipSubmit work={work} />
    </form>
  );
}

function SkipSubmit({ work }: { work: AtlasWork }) {
  const t = useTranslations("saga");
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={styles.skip}
      data-testid={work.skipped ? "unskip-optional" : "skip-optional"}
      aria-label={work.skipped ? t("timelineUnskipAria", { title: work.title }) : t("timelineSkipAria", { title: work.title })}
    >
      {work.skipped ? t("timelineUnskip") : t("timelineSkip")}
    </button>
  );
}
