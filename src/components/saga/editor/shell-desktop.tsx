"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { sagaHref } from "@/lib/catalog/item-href";
import { StepRow } from "./step-row";
import { RouteSavebar } from "./route-savebar";
import { AddStepsList } from "./add-steps-list";
import type { RouteEditorItem } from "@/lib/sagas/hydrate-route-draft";
import type { RouteDiff } from "@/lib/sagas/compute-route-diff";

export function EditorShellDesktop({
  sagaId,
  sagaName,
  routeName,
  stepsLabel,
  draft,
  palette,
  diff,
  error,
  pending,
  onMove,
  onRemove,
  onNoteChange,
  onAdd,
  onSave,
}: {
  sagaId: string;
  sagaName: string;
  routeName: string;
  stepsLabel: string;
  draft: RouteEditorItem[];
  palette: RouteEditorItem[];
  diff: RouteDiff;
  error: string | null;
  pending: boolean;
  onMove: (index: number, delta: number) => void;
  onRemove: (key: string) => void;
  onNoteChange: (key: string, note: string | null) => void;
  onAdd: (item: RouteEditorItem) => void;
  onSave: () => void;
}) {
  const t = useTranslations("sagaEditor");
  const inDraftKeys = new Set(draft.map((d) => d.key));

  return (
    <div className="pb-6">
      <header className="flex items-center gap-4 border-b border-border bg-surface px-6 py-4">
        <Link
          href={`${sagaHref(sagaId)}/rutas`}
          aria-label={t("routesBack")}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-[15px]"
        >
          ‹
        </Link>
        <div className="min-w-0 flex-1">
          <p className="mb-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-foreground-faint">
            {sagaName} · {t("routesTitle")}
          </p>
          <h1 className="font-serif text-[23px] font-semibold leading-tight">{routeName}</h1>
        </div>
      </header>

      <div className="grid grid-cols-[1fr_350px] gap-6 px-6 py-5">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.13em] text-muted-foreground">
              {t("routeStepsTitle")}
            </h2>
            <span className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">{stepsLabel}</span>
          </div>

          {draft.length === 0 ? (
            <div className="rounded-xl border border-dashed border-foreground/25 bg-surface/45 px-4 py-6 text-center">
              <b className="mb-1.5 block font-serif text-[15px] font-semibold">{t("routeStepsEmptyTitle")}</b>
              <p className="mx-auto max-w-[320px] text-[12px] leading-snug text-muted-foreground">
                {t("routeStepsEmptyBody")}
              </p>
            </div>
          ) : (
            <ol className="flex flex-col gap-1.5">
              {draft.map((d, i) => (
                <StepRow
                  key={d.key}
                  item={d}
                  index={i}
                  isFirst={i === 0}
                  isLast={i === draft.length - 1}
                  onMove={(delta) => onMove(i, delta)}
                  onRemove={() => onRemove(d.key)}
                  onNoteChange={(note) => onNoteChange(d.key, note)}
                />
              ))}
            </ol>
          )}

          <div className="mt-3">
            <RouteSavebar diff={diff} error={error} pending={pending} onSave={onSave} />
          </div>
        </div>

        <aside className="grid content-start gap-3.5">
          <section className="rounded-xl border border-border bg-surface p-3.5">
            <h3 className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.13em] text-muted-foreground">
              {t("routeAddSheetTitle")}
            </h3>
            <AddStepsList palette={palette} inDraftKeys={inDraftKeys} onAdd={onAdd} />
          </section>

          <section className="rounded-xl border border-border bg-surface p-3.5">
            <h3 className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.13em] text-muted-foreground">
              {t("routePreviewTitle")}
            </h3>
            <ol className="grid gap-1.5">
              {draft.map((d, i) => (
                <li key={d.key} className="flex items-center gap-2 text-[12px]">
                  <span className="w-5 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{d.label}</span>
                </li>
              ))}
              {draft.length === 0 && <li className="text-[11.5px] text-muted-foreground">{t("routePreviewEmpty")}</li>}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
