"use client";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { setShowOptionalReadings } from "@/lib/sagas/optional-actions";
import styles from "./atlas.module.css";

// Interruptor de la preferencia GLOBAL `profiles.show_optional_readings` en el atlas. El
// timeline retirado lo tenía (OptionalBar); sin él, quien apagaba las opcionales no podía
// volver a verlas desde ningún sitio, porque `deriveTimeline` ya las esconde en el servidor.
//
// Quien lo pinta decide si toca (sesión y al menos una opcional): aquí solo se pinta.
// `<form action>` con la acción ya ligada al valor CONTRARIO; `revalidateSagaPage` incluye
// `/mapa`, así que el servidor vuelve con el modelo nuevo sin router.refresh().
export function OptionalToggle({ sagaId, count, shown }: { sagaId: string; count: number; shown: boolean }) {
  return (
    <form action={setShowOptionalReadings.bind(null, !shown, sagaId)} className={styles.optionalForm}>
      <OptionalSubmit count={count} shown={shown} />
    </form>
  );
}

function OptionalSubmit({ count, shown }: { count: number; shown: boolean }) {
  const t = useTranslations("saga.atlas");
  const { pending } = useFormStatus();
  // El estado va en texto además de en `aria-pressed` y en el relleno: no depende del color.
  return (
    <button type="submit" disabled={pending} className={styles.chip} data-toggle aria-pressed={shown}
      data-testid="atlas-optional-toggle">
      <span aria-hidden="true">{shown ? "●" : "○"}</span> {t("optionalToggle", { count })}: {shown ? t("optionalShown") : t("optionalHidden")}
    </button>
  );
}
