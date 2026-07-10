"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import type { Challenge } from "@/lib/challenges/types";
import {
  createChallenge,
  updateChallenge,
  type ChallengeFormState,
} from "@/lib/challenges/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

const initialState: ChallengeFormState = {};
const ITEM_TYPES: ItemType[] = ["book", "movie", "series"];

// Create or edit a challenge (§7.10). `challenge` present = edit mode; the
// action is bound to its id. Genre is the free-form criterion exposed in v1;
// saga-scoped challenges are supported by the matcher but not yet by this form.
export function ChallengeForm({
  challenge,
  onDone,
}: {
  challenge?: Challenge;
  onDone?: () => void;
}) {
  const t = useTranslations("challenges");
  const tTypes = useTranslations("search.types");

  const action = challenge
    ? updateChallenge.bind(null, challenge.id)
    : createChallenge;
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
    >
      <Field label={t("fields.name")} htmlFor="challenge-name">
        <Input
          id="challenge-name"
          name="name"
          defaultValue={challenge?.name ?? ""}
          placeholder={t("fields.namePlaceholder")}
          required
        />
      </Field>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Field label={t("fields.type")} htmlFor="challenge-type">
          <select
            id="challenge-type"
            name="itemType"
            defaultValue={challenge?.itemType ?? ""}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
          >
            <option value="">{t("anyType")}</option>
            {ITEM_TYPES.map((type) => (
              <option key={type} value={type}>
                {tTypes(type)}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t("fields.target")} htmlFor="challenge-target">
          <Input
            id="challenge-target"
            name="targetCount"
            type="number"
            min={1}
            defaultValue={challenge?.targetCount ?? ""}
            required
          />
        </Field>
      </div>

      <Field label={t("fields.genre")} htmlFor="challenge-genre">
        <Input
          id="challenge-genre"
          name="genre"
          defaultValue={challenge?.criteria.genre ?? ""}
          placeholder={t("fields.genrePlaceholder")}
        />
      </Field>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Field label={t("fields.start")} htmlFor="challenge-start">
          <Input
            id="challenge-start"
            name="startDate"
            type="date"
            defaultValue={challenge?.startDate ?? ""}
            required
          />
        </Field>
        <Field label={t("fields.end")} htmlFor="challenge-end">
          <Input
            id="challenge-end"
            name="endDate"
            type="date"
            defaultValue={challenge?.endDate ?? ""}
            required
          />
        </Field>
      </div>

      {/* Preserva el criterio de saga (no editable en v1) para que editar un
          reto de saga no lo pierda. */}
      {challenge?.criteria.sagaId && (
        <input type="hidden" name="sagaId" value={challenge.criteria.sagaId} />
      )}

      {state.error && (
        <p className="text-sm text-status-dropped">{t(`errors.${state.error}`)}</p>
      )}

      <div className="flex gap-2">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? t("saving") : challenge ? t("save") : t("create")}
        </Button>
        {onDone && (
          <Button type="button" variant="ghost" onClick={onDone}>
            {t("cancel")}
          </Button>
        )}
      </div>
    </form>
  );
}
