"use client";

import { useRef, useState, useTransition } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  deleteSaga,
  setParentSaga,
  updateSagaMeta,
  uploadSagaCover,
  type CurationState,
} from "@/lib/sagas/curation-actions";
import type { SagaAccentToken } from "@/lib/sagas/accents";
import { SagaPicker } from "@/components/saga-picker";
import { AccentRadio } from "./accent-radio";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const initialState: CurationState = {};

// Editor de la ficha de saga (spec fase 3.5, Task 4): tres bloques
// independientes. Metadatos (nombre/sinopsis/acento) via <form action>
// (patrón CurationState de createSaga); universo padre y portada son
// acciones inmediatas fuera del form — no hay "guardar" único para los tres.
export function SagaMetaEditor({
  sagaId,
  initial,
}: {
  sagaId: string;
  initial: {
    name: string;
    overview: string | null;
    coverUrl: string | null;
    accent: SagaAccentToken | null;
    parent: { id: string; name: string } | null;
  };
}) {
  const t = useTranslations("saga");
  const router = useRouter();
  const [state, formAction, pending] = useActionState(updateSagaMeta.bind(null, sagaId), initialState);

  // Universo padre: acción inmediata (no forma parte del form de metadatos).
  const [parent, setParent] = useState(initial.parent);
  const [parentError, setParentError] = useState<string | null>(null);
  const [parentPending, startParentTransition] = useTransition();
  const [newParentName, setNewParentName] = useState("");

  function applyParent(next: { id: string } | { newName: string } | null) {
    setParentError(null);
    startParentTransition(async () => {
      try {
        const result = await setParentSaga(sagaId, next);
        if (result.error) {
          // El trigger de BD también cae aquí (no en "cycle") cuando la
          // jerarquía supera 10 niveles de profundidad — aceptado.
          setParentError(result.error);
          return;
        }
        // Usar siempre el nombre canónico que devuelve el servidor, nunca lo
        // tecleado en el cliente (puede reutilizar una saga homónima con
        // nombre distinto en BD).
        setParent(result.parent ?? null);
        setNewParentName("");
        router.refresh();
      } catch {
        setParentError("generic");
      }
    });
  }

  // Portada: subida directa al elegir archivo (patrón uploadCover de ítems).
  const [coverUrl, setCoverUrl] = useState(initial.coverUrl);
  const [coverError, setCoverError] = useState(false);
  const [coverPending, startCoverTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function handleCoverChange(file: File | undefined) {
    if (!file) return;
    setCoverError(false);
    const formData = new FormData();
    formData.set("file", file);
    startCoverTransition(async () => {
      try {
        const result = await uploadSagaCover(sagaId, formData);
        if (result.error || !result.url) setCoverError(true);
        else setCoverUrl(result.url);
      } catch {
        setCoverError(true);
      }
    });
  }

  // Zona de peligro: confirmación en dos pasos en estado local (patrón
  // portada/universo — acción inmediata fuera del form de metadatos).
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const [deletePending, startDeleteTransition] = useTransition();

  function handleDelete() {
    setDeleteError(false);
    startDeleteTransition(async () => {
      try {
        const result = await deleteSaga(sagaId);
        // deleteSaga redirige a /sagas si borra; si devuelve, es error.
        if (result?.error) setDeleteError(true);
      } catch (err) {
        // redirect() de Next lanza NEXT_REDIRECT: dejarlo propagar.
        if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw err;
        setDeleteError(true);
      }
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {/* ── Metadatos ── */}
      <form action={formAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
            {t("editName")}
          </span>
          <Input name="name" required maxLength={120} defaultValue={initial.name} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
            {t("editOverview")}
          </span>
          <textarea
            name="overview"
            rows={4}
            defaultValue={initial.overview ?? ""}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
            {t("editAccent")}
          </span>
          <AccentRadio name="accent" defaultValue={initial.accent} />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? t("editSaving") : t("editSave")}
        </Button>
        {state.error && <p className="text-sm text-status-dropped">{t(`editErrors.${state.error}`)}</p>}
      </form>

      {/* ── Portada ── */}
      <div className="flex items-center gap-4">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt="" className="h-[84px] w-[56px] rounded-md object-cover" />
        ) : (
          <span aria-hidden className="block h-[84px] w-[56px] rounded-md border border-dashed border-border" />
        )}
        <div className="flex flex-col gap-1">
          <Button type="button" variant="secondary" disabled={coverPending} onClick={() => fileRef.current?.click()}>
            {coverPending ? t("editCoverUploading") : t("editCoverChange")}
          </Button>
          {coverError && <p className="text-sm text-status-dropped">{t("editErrors.generic")}</p>}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => handleCoverChange(e.target.files?.[0])}
          />
        </div>
      </div>

      {/* ── Universo padre ── */}
      <div id="universo" className="flex flex-col gap-3 scroll-mt-24">
        <span className="font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
          {t("editParent")}
        </span>
        {parent ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{t("partOf", { name: parent.name })}</span>
            <button
              type="button"
              disabled={parentPending}
              onClick={() => applyParent(null)}
              className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
            >
              {t("editParentRemove")}
            </button>
          </div>
        ) : (
          <>
            <SagaPicker value={null} onChange={(saga) => saga && applyParent({ id: saga.id })} />
            <div className="flex gap-2">
              <Input
                value={newParentName}
                onChange={(e) => setNewParentName(e.target.value)}
                placeholder={t("editParentNewPlaceholder")}
                maxLength={120}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={parentPending || !newParentName.trim()}
                onClick={() => applyParent({ newName: newParentName })}
              >
                {t("editParentCreate")}
              </Button>
            </div>
          </>
        )}
        {parentError && (
          <p className="text-sm text-status-dropped">
            {parentError === "cycle" ? t("editErrors.cycle") : t("editErrors.generic")}
          </p>
        )}
      </div>

      {/* ── Zona de peligro ── */}
      <div className="flex flex-col gap-2 rounded-xl border border-status-dropped/40 p-4">
        <span className="font-mono text-[11px] tracking-[0.12em] text-status-dropped uppercase">
          {t("dangerZone")}
        </span>
        {confirmingDelete ? (
          <>
            <p className="text-xs text-muted-foreground">{t("deleteWarning")}</p>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" disabled={deletePending} onClick={() => setConfirmingDelete(false)}>
                {t("deleteCancel")}
              </Button>
              <button
                type="button"
                disabled={deletePending}
                onClick={handleDelete}
                className="rounded-full bg-status-dropped px-5 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {deletePending ? t("deleting") : t("deleteConfirm")}
              </button>
            </div>
            {deleteError && <p className="text-sm text-status-dropped">{t("editErrors.generic")}</p>}
          </>
        ) : (
          <Button type="button" variant="secondary" onClick={() => setConfirmingDelete(true)} className="self-start">
            {t("deleteSaga")}
          </Button>
        )}
      </div>
    </div>
  );
}
