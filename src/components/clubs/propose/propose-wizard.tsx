"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import type { Json } from "@/lib/supabase/database.types";
import type { LibraryItem } from "@/lib/library/types";
import type { ItemType } from "@/lib/catalog/types";
import type { ActivityKind } from "@/lib/clubs/activities/core";
import {
  proposeActivityWithSetup,
  type ProposedItem,
} from "@/lib/clubs/activities/propose";
import {
  ACTIVITY_KIND_ORDER,
  getActivityKindDefinition,
} from "@/lib/clubs/activities/kinds/registry";
import { ACTIVITY_ACCENT } from "@/lib/clubs/activities/kinds/accent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { XIcon } from "@/components/ui/icons";
import { LibraryItemPicker } from "../library-item-picker";
import {
  CheckpointDraftEditor,
  toProposedCheckpoints,
  type CheckpointDraft,
} from "./checkpoint-draft-editor";

// Asistente de dos pasos:
//   1. lo común (título, descripción) + elegir tipo con tarjetas
//   2. los campos propios del tipo elegido
//
// El composer anterior era un formulario plano con un <select> de tipo, y dejaba
// la actividad VACÍA: había que crearla, entrar en ella y añadirle a mano los
// ítems y los hitos. Aquí se propone ya montada.
export function ProposeWizard({
  clubId,
  onProposed,
  onCancel,
}: {
  clubId: string;
  onProposed: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("activity");
  const [step, setStep] = useState<1 | 2>(1);
  const [kind, setKind] = useState<ActivityKind | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");

  const [config, setConfig] = useState<Json | null>(null);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [picking, setPicking] = useState(false);
  const [checkpoints, setCheckpoints] = useState<CheckpointDraft[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const definition = kind ? getActivityKindDefinition(kind) : null;
  // La lectura conjunta es de UN ítem: su tipo decide si los hitos piden página
  // o temporada/episodio.
  const readItemType: ItemType | null = items[0]?.itemType ?? null;

  function submit() {
    if (!kind) return;
    setError(null);

    startTransition(async () => {
      try {
        await proposeActivityWithSetup({
          clubId,
          kind,
          title,
          description: description || undefined,
          startsOn: startsOn || undefined,
          endsOn: endsOn || undefined,
          config,
          items: items.map(
            (item): ProposedItem => ({
              itemType: item.itemType,
              itemId: item.itemId,
            }),
          ),
          checkpoints:
            kind === "buddy_read"
              ? toProposedCheckpoints(checkpoints, readItemType)
              : undefined,
        });
        onProposed();
      } catch {
        setError(t("proposeError"));
      }
    });
  }

  // ── Paso 1: lo común + el tipo ──────────────────────────────────────────
  if (step === 1) {
    return (
      <Panel title={t("propose")} onCancel={onCancel}>
        <Field label={t("titleLabel")} htmlFor="activity-title">
          <Input
            id="activity-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("titlePlaceholder")}
            className="w-full"
          />
        </Field>

        <Field label={t("descriptionLabel")} htmlFor="activity-description">
          <textarea
            id="activity-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("descriptionPlaceholder")}
            rows={2}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
          />
        </Field>

        <div className="flex flex-col gap-2">
          <span className="font-mono text-xs tracking-wider text-muted-foreground uppercase">
            {t("kind")}
          </span>

          <div className="grid gap-2 sm:grid-cols-2">
            {ACTIVITY_KIND_ORDER.map((option) => {
              const accent = ACTIVITY_ACCENT[option];
              const selected = kind === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setKind(option)}
                  className={`flex flex-col items-start gap-1.5 rounded-card border p-3 text-left transition-colors ${
                    selected
                      ? `${accent.borderSoft} ${accent.bgSoft}`
                      : "border-border hover:bg-surface-muted"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`grid h-8 w-8 place-items-center rounded-chip border ${accent.borderSoft} ${accent.bgSoft} ${accent.text}`}
                  >
                    <accent.Icon className="h-4 w-4" />
                  </span>
                  <span className="font-serif text-sm font-semibold text-foreground">
                    {t(`kind_${option}`)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t(`kindHint_${option}`)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <Button
          type="button"
          disabled={!title.trim() || !kind}
          onClick={() => setStep(2)}
          className="w-full"
        >
          {t("continue")}
        </Button>
      </Panel>
    );
  }

  // ── Paso 2: lo propio del tipo ──────────────────────────────────────────
  const accent = ACTIVITY_ACCENT[kind!];
  const ConfigFields = definition?.ConfigFields;
  const maxItems = definition?.maxItems ?? null;
  const canAddMore = maxItems === null || items.length < maxItems;

  return (
    <Panel title={title || t("propose")} onCancel={onCancel}>
      <span
        className={`inline-flex w-fit items-center gap-1.5 rounded-chip border px-2 py-1 font-mono text-[10px] tracking-wider uppercase ${accent.borderSoft} ${accent.bgSoft} ${accent.text}`}
      >
        <accent.Icon className="h-3 w-3" />
        {t(`kind_${kind}`)}
      </span>

      {/* Pool de ítems: lo tienen todos los kinds salvo el reto por criterio, que
          se DESCRIBE por criterio y no enumera ítems. */}
      {definition?.usesItemPool && (
        <div className="flex flex-col gap-2">
          <span className="font-mono text-xs tracking-wider text-muted-foreground uppercase">
            {kind === "buddy_read" ? t("proposeItem") : t("proposeItems")}
          </span>

          {items.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {items.map((item) => (
                <div
                  key={`${item.itemType}:${item.itemId}`}
                  className="relative h-24 w-16 overflow-hidden rounded-cover border border-border bg-surface-muted shadow-cover"
                >
                  {item.coverUrl && (
                    <Image
                      src={item.coverUrl}
                      alt={item.title}
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  )}
                  <button
                    type="button"
                    aria-label={t("removeItem")}
                    onClick={() =>
                      setItems((prev) =>
                        prev.filter(
                          (i) =>
                            !(
                              i.itemType === item.itemType &&
                              i.itemId === item.itemId
                            ),
                        ),
                      )
                    }
                    className="absolute top-1 right-1 grid h-5 w-5 place-items-center rounded-full bg-scrim text-accent-foreground"
                  >
                    <XIcon className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {picking ? (
            <LibraryItemPicker
              allowedItemTypes={definition.allowedItemTypes}
              onPick={(item) => {
                setItems((prev) =>
                  prev.some(
                    (i) =>
                      i.itemType === item.itemType && i.itemId === item.itemId,
                  )
                    ? prev
                    : [...prev, item],
                );
                setPicking(false);
              }}
              onCancel={() => setPicking(false)}
            />
          ) : (
            canAddMore && (
              <Button
                type="button"
                variant="secondary"
                className="self-start"
                onClick={() => setPicking(true)}
              >
                {t("addItem")}
              </Button>
            )
          )}
        </div>
      )}

      {/* Campos propios del kind (tierlist: niveles; reto: modo y meta). */}
      {ConfigFields && <ConfigFields value={config} onChange={setConfig} />}

      {kind === "buddy_read" && (
        <CheckpointDraftEditor
          itemType={readItemType}
          drafts={checkpoints}
          onChange={setCheckpoints}
        />
      )}

      <div className="flex gap-2">
        <Field label={t("startsOn")} htmlFor="activity-starts">
          <Input
            id="activity-starts"
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            className="w-full"
          />
        </Field>
        <Field label={t("endsOn")} htmlFor="activity-ends">
          <Input
            id="activity-ends"
            type="date"
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
            className="w-full"
          />
        </Field>
      </div>

      {error && <p className="text-sm text-status-dropped">{error}</p>}

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          disabled={isPending}
          onClick={submit}
          className="w-full"
        >
          {isPending ? t("proposeSubmitting") : t("proposeSubmit")}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          {t("proposeNeedsApproval")}
        </p>
        <Button type="button" variant="ghost" onClick={() => setStep(1)}>
          {t("back")}
        </Button>
      </div>
    </Panel>
  );
}

function Panel({
  title,
  onCancel,
  children,
}: {
  title: string;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-serif text-lg font-semibold text-foreground">
          {title}
        </h2>
        <button
          type="button"
          aria-label="Cerrar"
          onClick={onCancel}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-muted"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>
      {children}
    </div>
  );
}
