"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { proposeActivity, type ActivityKind } from "@/lib/clubs/activities/core";
import {
  ACTIVITY_KIND_ORDER,
  getActivityKindDefinition,
} from "@/lib/clubs/activities/kinds/registry";
import type { Json } from "@/lib/supabase/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function ActivityComposer({
  clubId,
  onProposed,
}: {
  clubId: string;
  onProposed: () => void;
}) {
  const t = useTranslations("activity");
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ActivityKind>("buddy_read");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  // El config es específico del kind (SD-8) -- lo aporta ConfigFields del registro, si el
  // kind elegido tiene uno.
  const [config, setConfig] = useState<Json | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const ConfigFields = getActivityKindDefinition(kind).ConfigFields;

  function reset() {
    setOpen(false);
    setKind("buddy_read");
    setTitle("");
    setDescription("");
    setStartsOn("");
    setEndsOn("");
    setConfig(null);
    setError(null);
  }

  function submit() {
    startTransition(async () => {
      try {
        await proposeActivity(
          clubId,
          kind,
          title,
          description || undefined,
          startsOn || undefined,
          endsOn || undefined,
          config ?? undefined,
        );
        reset();
        onProposed();
      } catch {
        setError(t("proposeError"));
      }
    });
  }

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        {t("propose")}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {t("kind")}
        <Select
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as ActivityKind);
            setConfig(null); // el config de un kind no vale para otro
          }}
        >
          {ACTIVITY_KIND_ORDER.map((k) => (
            <option key={k} value={k}>
              {t(`kind_${k}`)}
            </option>
          ))}
        </Select>
      </label>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("titlePlaceholder")} />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t("descriptionPlaceholder")}
        rows={2}
        className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />

      {/* Campos propios del kind (SD-8) -- p.ej. el criterio de un criteria_challenge. */}
      {ConfigFields && <ConfigFields value={config} onChange={setConfig} />}

      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
          {t("startsOn")}
          <input
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
          {t("endsOn")}
          <input
            type="date"
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
      </div>
      {error && <p className="text-xs text-status-dropped">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" disabled={isPending || !title.trim()} onClick={submit}>
          {t("proposeSubmit")}
        </Button>
        <Button type="button" variant="ghost" onClick={reset}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}
