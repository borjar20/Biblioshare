"use client";

import { useTranslations } from "next-intl";

export function EditorSaveBar({
  dirty,
  saving,
  error,
  hasErrors,
  onDiscard,
  onSave,
}: {
  dirty: number;
  saving: boolean;
  error: string | null;
  hasErrors: boolean;
  onDiscard: () => void;
  onSave: () => void;
}) {
  const t = useTranslations("sagaEditor");
  return (
    <footer className="flex items-center gap-3 border-t border-border bg-surface px-4 py-3">
      <span className="font-mono text-[10.5px] text-muted-foreground">{t("draftChanges", { count: dirty })}</span>
      {error && <span className="text-[11px] font-semibold text-red-600">{error}</span>}
      <span className="flex-1" />
      <button type="button" onClick={onDiscard} className="h-9 rounded-lg border border-border px-4 text-xs font-semibold text-muted-foreground">
        {t("discard")}
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={saving || dirty === 0 || hasErrors}
        className="h-9 rounded-lg bg-accent px-5 text-xs font-semibold text-accent-foreground disabled:opacity-50"
      >
        {saving ? t("saving") : t("save")}
      </button>
    </footer>
  );
}
