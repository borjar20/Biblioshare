"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import type { MediaStatus } from "@/lib/library/types";
import type { Position } from "@/lib/library/position";
import { addSession, type AddSessionState } from "@/lib/sessions/actions";

const STATUSES: MediaStatus[] = [
  "planned",
  "in_progress",
  "completed",
  "dropped",
];

const initialState: AddSessionState = {};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function SessionForm({
  entryId,
  itemType,
  itemId,
  position,
  status,
  total,
}: {
  entryId: string;
  itemType: "book" | "series";
  itemId: string;
  position: Position;
  status: MediaStatus;
  total: number | null;
}) {
  const t = useTranslations("session");
  const tLibrary = useTranslations("library");

  const boundAddSession = addSession.bind(null, entryId, itemType, itemId);
  const [state, formAction, pending] = useActionState(
    boundAddSession,
    initialState,
  );

  // Opening a session on a "planned" item means you're starting it now.
  const defaultStatus = status === "planned" ? "in_progress" : status;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label={t("date")} htmlFor="session-date">
        <Input
          id="session-date"
          name="sessionDate"
          type="date"
          required
          defaultValue={todayISO()}
        />
      </Field>

      {/* Solo lectura registra minutos (§7.14): una serie se mide por
          episodios alcanzados, y su duración sale del catálogo. */}
      {itemType === "book" && (
        <Field
          label={t("duration")}
          htmlFor="session-duration"
          hint={t("durationHint")}
        >
          <Input
            id="session-duration"
            name="durationMinutes"
            type="number"
            min={0}
            inputMode="numeric"
            placeholder="0"
          />
        </Field>
      )}

      {itemType === "book" ? (
        <Field
          label={t("page")}
          htmlFor="session-page"
          hint={total ? t("pageOf", { total }) : undefined}
        >
          <Input
            id="session-page"
            name="page"
            type="number"
            min={0}
            max={total ?? undefined}
            defaultValue={
              "page" in position && position.page !== undefined
                ? position.page
                : ""
            }
          />
        </Field>
      ) : (
        <div className="flex gap-3">
          <Field label={t("season")} htmlFor="session-season">
            <Input
              id="session-season"
              name="season"
              type="number"
              min={0}
              defaultValue={"season" in position ? position.season : ""}
            />
          </Field>
          <Field label={t("episode")} htmlFor="session-episode">
            <Input
              id="session-episode"
              name="episode"
              type="number"
              min={0}
              max={total ?? undefined}
              defaultValue={"episode" in position ? position.episode : ""}
            />
          </Field>
        </div>
      )}

      <Field label={t("note")} htmlFor="session-note" hint={t("noteHint")}>
        <textarea
          id="session-note"
          name="note"
          rows={3}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </Field>

      <Field label={t("status")} htmlFor="session-status">
        <Select id="session-status" name="status" defaultValue={defaultStatus}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {tLibrary(`status.${s}`)}
            </option>
          ))}
        </Select>
      </Field>

      {state.error && (
        <p className="text-sm text-status-dropped">
          {t(`errors.${state.error}`)}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
