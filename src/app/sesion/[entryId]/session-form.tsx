"use client";

import { useActionState, useState } from "react";
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

  const currentPage =
    "page" in position && position.page !== undefined ? position.page : null;

  // Tramo desde → hasta (§Tarea 13): `fromPage` es solo ayuda visual para el
  // delta en vivo, nunca se envía al servidor — la sesión ya registra la
  // posición alcanzada, y el tramo se deduce comparando con la sesión
  // anterior. Por eso este input no lleva `name`.
  const [fromPage, setFromPage] = useState(
    currentPage !== null ? String(currentPage) : "",
  );
  const [toPage, setToPage] = useState("");

  const fromPageNum = fromPage.trim() === "" ? null : Number(fromPage);
  const toPageNum = toPage.trim() === "" ? null : Number(toPage);
  const delta =
    fromPageNum !== null &&
    toPageNum !== null &&
    Number.isFinite(fromPageNum) &&
    Number.isFinite(toPageNum)
      ? toPageNum - fromPageNum
      : null;
  const remaining =
    toPageNum !== null && total !== null ? total - toPageNum : null;

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
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t("pagesRange")}</span>
          <div className="flex items-end gap-2.5">
            <div className="flex-1">
              <Input
                id="session-from-page"
                type="number"
                min={0}
                inputMode="numeric"
                aria-label={t("pageFrom")}
                value={fromPage}
                onChange={(e) => setFromPage(e.target.value)}
                className="text-center"
              />
              <p className="mt-1.5 text-center text-xs text-muted-foreground">
                {t("pageFrom")}
              </p>
            </div>
            <span className="pb-4 text-muted-foreground">→</span>
            <div className="flex-1">
              <Input
                id="session-page"
                name="page"
                type="number"
                min={0}
                max={total ?? undefined}
                inputMode="numeric"
                aria-label={t("pageTo")}
                value={toPage}
                onChange={(e) => setToPage(e.target.value)}
                className="text-center"
              />
              <p className="mt-1.5 text-center text-xs text-muted-foreground">
                {t("pageTo")}
              </p>
            </div>
          </div>

          {delta !== null && delta > 0 && (
            <span className="mt-1.5 inline-flex w-fit items-center gap-1.5 rounded-md border border-green/25 bg-green/10 px-2.5 py-1.5 font-mono text-[11px] text-green">
              {t("delta", { delta })}
              {remaining !== null && ` · ${t("remaining", { remaining })}`}
            </span>
          )}
        </div>
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
