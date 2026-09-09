"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { previewArchive, type ArchivePreviewState } from "./archive-actions";

const initial: ArchivePreviewState = {};

export function ArchiveForm() {
  const t = useTranslations("import.archive");
  const [state, action, pending] = useActionState(previewArchive, initial);
  return (
    <section className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <p className="text-sm text-muted-foreground">{t("help")}</p>
      <form action={action} className="flex flex-col gap-3">
        <label htmlFor="letterboxd-archive">{t("file")}</label>
        <input
          id="letterboxd-archive"
          name="archive"
          type="file"
          accept=".zip,application/zip"
          required
          className="text-sm text-foreground file:mr-3 file:rounded-full file:border-0 file:bg-accent file:px-4 file:py-2 file:text-sm file:font-medium file:text-accent-foreground"
        />
        <Button type="submit" disabled={pending} className="self-start">{pending ? t("analyzing") : t("analyze")}</Button>
      </form>
      {state.error && <p role="alert">{t(`errors.${state.error}`)}</p>}
      {state.analysis && (
        <div className="flex flex-col gap-3" aria-live="polite">
          <h3 className="font-semibold">{t("summary")}</h3>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Object.entries(state.analysis.summary).map(([key, count]) => (
              <div key={key}><dt>{t(`counts.${key}`)}</dt><dd className="font-semibold">{count}</dd></div>
            ))}
          </dl>
          <p>{t("previewOnly")}</p>
          {state.analysis.excludedFiles.length > 0 && <details><summary>{t("excluded")}</summary><ul>{state.analysis.excludedFiles.map((name) => <li key={name}>{name}</li>)}</ul></details>}
          <details><summary>{t("movies")}</summary><ul>{state.analysis.movies.map((movie) => <li key={movie.sourceKey}>{movie.title} {movie.year ? `(${movie.year})` : ""}</li>)}</ul></details>
        </div>
      )}
    </section>
  );
}
