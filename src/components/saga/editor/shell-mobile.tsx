"use client";

import { useTranslations } from "next-intl";
import { StepRow } from "./step-row";
import { RouteSavebar } from "./route-savebar";
import { AddStepsSheet } from "./add-steps-sheet";
import type { RouteEditorItem } from "@/lib/sagas/hydrate-route-draft";
import type { RouteDiff } from "@/lib/sagas/compute-route-diff";

export function EditorShellMobile({
  routeName,
  sagaName,
  stepsLabel,
  draft,
  palette,
  diff,
  error,
  pending,
  addOpen,
  onMove,
  onRemove,
  onNoteChange,
  onOpenAdd,
  onCloseAdd,
  onAdd,
  onSave,
}: {
  routeName: string;
  sagaName: string;
  stepsLabel: string;
  draft: RouteEditorItem[];
  palette: RouteEditorItem[];
  diff: RouteDiff;
  error: string | null;
  pending: boolean;
  addOpen: boolean;
  onMove: (index: number, delta: number) => void;
  onRemove: (key: string) => void;
  onNoteChange: (key: string, note: string | null) => void;
  onOpenAdd: () => void;
  onCloseAdd: () => void;
  onAdd: (item: RouteEditorItem) => void;
  onSave: () => void;
}) {
  const t = useTranslations("sagaEditor");
  const inDraftKeys = new Set(draft.map((d) => d.key));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">{routeName}</h1>
        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {sagaName} · {stepsLabel}
        </p>
      </div>

      {draft.length === 0 ? (
        <div className="rounded-xl border border-dashed border-foreground/25 bg-surface/45 px-4 py-6 text-center">
          <b className="mb-1.5 block font-serif text-[15px] font-semibold">{t("routeStepsEmptyTitle")}</b>
          <p className="mx-auto mb-3 max-w-[320px] text-[12px] leading-snug text-muted-foreground">
            {t("routeStepsEmptyBody")}
          </p>
          <button
            type="button"
            onClick={onOpenAdd}
            className="rounded-lg bg-accent px-3 py-1.5 text-[11.5px] font-semibold text-accent-foreground"
          >
            + {t("routeStepAddSteps")}
          </button>
        </div>
      ) : (
        <>
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
          <button
            type="button"
            onClick={onOpenAdd}
            className="w-full rounded-lg border border-dashed border-border py-2 text-center text-[11.5px] font-semibold text-muted-foreground"
          >
            + {t("routeStepAddSteps")}
          </button>
        </>
      )}

      <RouteSavebar diff={diff} error={error} pending={pending} onSave={onSave} />

      {addOpen && (
        <AddStepsSheet
          sagaName={sagaName}
          palette={palette}
          inDraftKeys={inDraftKeys}
          onAdd={onAdd}
          onClose={onCloseAdd}
        />
      )}
    </div>
  );
}
