"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ReviewContent } from "@/components/detail/review-content";
import { applyArchiveReview, loadArchiveReview } from "./archive-actions";
import { archiveFieldEffect, archiveRepairDecision, eligibleArchiveDecision,
  type ArchiveApprovedRow, type ArchiveDecision, type ArchiveDecisionResult, type ArchiveRowReview } from "@/lib/import/archive-review";

const PAGE_SIZE = 20;
const actions: ArchiveDecision[] = ["retry", "associate", "fill", "dismiss", "accept", "separate"];

export function ArchiveRecoveryReview({ jobId }: { jobId: string }) {
  const t = useTranslations("import.archive.recovery");
  const states = useTranslations("import.archive.rowStates");
  const [rows, setRows] = useState<ArchiveRowReview[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [action, setAction] = useState<ArchiveDecision>("associate");
  const [approved, setApproved] = useState<ArchiveApprovedRow[] | null>(null);
  const [results, setResults] = useState<ArchiveDecisionResult[]>([]);
  const [plan, setPlan] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const filtered = (rows ?? []).filter(row => filter === "all" || row.state === filter);
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const hiddenSelected = [...selected].filter(id => !visible.some(r => r.ordinal === id)).length;
  function load(asPlan: boolean) {
    startTransition(async () => {
      setFailed(false);
      try {
        const next = await loadArchiveReview(jobId);
        setRows(next); setPage(0); setFilter("all"); setApproved(null); setResults([]); setPlan(asPlan);
        setSelected(new Set(asPlan ? next.filter(row => archiveRepairDecision(row)).map(row => row.ordinal) : []));
      } catch { setFailed(true); }
    });
  }
  function preview() {
    setResults([]);
    setApproved((rows ?? []).filter(row => selected.has(row.ordinal)).flatMap(row => {
      const decision = plan ? archiveRepairDecision(row) : action;
      return decision && eligibleArchiveDecision(row, decision) ? [{ ordinal: row.ordinal, version: row.version, decision }] : [];
    }));
  }
  function apply() {
    if (!approved) return;
    const snapshot = approved;
    startTransition(async () => {
      setFailed(false);
      try {
        const collected: ArchiveDecisionResult[] = [];
        for (let offset = 0; offset < snapshot.length; offset += 50) {
          collected.push(...await applyArchiveReview(jobId, snapshot.slice(offset, offset + 50)));
          setResults([...collected]);
        }
      } catch { setFailed(true); }
    });
  }
  return <section className="flex flex-col gap-3" aria-label={t("title")}>
    <div className="flex flex-wrap gap-2">
      <Button type="button" disabled={pending} onClick={() => load(false)}>{t("open")}</Button>
      <Button type="button" disabled={pending} onClick={() => load(true)}>{t("preparePlan")}</Button>
    </div>
    {failed && <p role="alert">{t("failed")}</p>}
    {rows && <fieldset disabled={pending} className="flex min-w-0 flex-col gap-3">
      <legend className="font-semibold">{plan ? t("plan") : t("title")}</legend>
      {plan && <p>{t("planHelp")}</p>}
      <label>{t("filter")} <select value={filter} onChange={e => { setFilter(e.target.value); setPage(0); }} className="rounded border border-border bg-surface p-2">
        <option value="all">{t("all")}</option>
        {["error", "conflict", "ambiguous", "unmatched", "imported", "dismissed", "pending"].map(state => <option key={state} value={state}>{states(state)}</option>)}
      </select></label>
      <p role="status">{t("selection", { count: selected.size, hidden: hiddenSelected })}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => { setSelected(new Set(filtered.map(r => r.ordinal))); setApproved(null); }}>{t("selectFiltered", { count: filtered.length })}</Button>
        <Button type="button" onClick={() => { setSelected(new Set()); setApproved(null); }}>{t("clear")}</Button>
      </div>
      <ul className="flex flex-col gap-3">{visible.map(row => <li key={row.ordinal} className="rounded border border-border p-3">
        <label className="flex items-start gap-2"><input type="checkbox" checked={selected.has(row.ordinal)} onChange={event => {
          setSelected(previous => { const next = new Set(previous); if (event.target.checked) next.add(row.ordinal); else next.delete(row.ordinal); return next; });
          setApproved(null);
        }} />{row.title} — {states(row.state)}</label>
        {row.catalogIncomplete && <p>{t("sharedCatalog")}</p>}
        {row.comparisons.some(c => c.proposed) && <p className="font-semibold">{t("proposal")}</p>}
        {plan && <p>{archiveRepairDecision(row) ? t(`actions.${archiveRepairDecision(row)}`) : t("manual")}</p>}
        {row.comparisons.map(comparison => <details key={comparison.incoming.sourceKey}>
          <summary>{t("compare")}</summary>
          <PassComparison comparison={comparison} overwrite={action === "accept" && !plan} />
        </details>)}
      </li>)}</ul>
      <nav className="flex items-center gap-3" aria-label={t("pages")}>
        <Button type="button" disabled={page === 0} onClick={() => setPage(p => p - 1)}>{t("previous")}</Button>
        <span>{t("page", { page: page + 1, total: Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)) })}</span>
        <Button type="button" disabled={(page + 1) * PAGE_SIZE >= filtered.length} onClick={() => setPage(p => p + 1)}>{t("next")}</Button>
      </nav>
      {!plan && <label>{t("action")} <select value={action} onChange={e => { setAction(e.target.value as ArchiveDecision); setApproved(null); }} className="rounded border border-border bg-surface p-2">
        {actions.map(value => <option key={value} value={value}>{t(`actions.${value}`)}</option>)}
      </select></label>}
      <Button type="button" disabled={!selected.size} onClick={preview}>{t("preview")}</Button>
      {approved && <div className="flex flex-col gap-3 rounded border border-border p-3">
        <p>{t("scope", { count: approved.length, excluded: selected.size - approved.length })}</p>
        <ul>{rows.filter(row => selected.has(row.ordinal) && !approved.some(item => item.ordinal === row.ordinal)).map(row => <li key={row.ordinal}>{row.title}: {t("manual")}</li>)}</ul>
        <p>{t("protected")}</p>
        <ul>{approved.map(item => {
          const row = rows.find(r => r.ordinal === item.ordinal)!;
          return <li key={item.ordinal} className="border-b border-border py-2">
            <p>{row.title}: {t(`actions.${item.decision}`)}</p>
            {item.decision === "catalog" && <p>{t("sharedCatalog")}</p>}
            {(item.decision === "separate" || item.decision === "accept") && <p>{t("newPasses", { count: item.decision === "separate" ? row.comparisons.length : row.comparisons.filter(c => !c.current).length })}</p>}
            {["associate", "fill", "accept", "separate"].includes(item.decision) && <>
              <p>{t(`planned.${row.plannedAction}`)}</p><p>{t("activeRule")}</p>
            </>}
            {["associate", "fill", "accept", "separate"].includes(item.decision) && row.comparisons.map(comparison =>
              <PassComparison key={comparison.incoming.sourceKey} comparison={comparison} overwrite={item.decision === "accept"} />)}
          </li>;
        })}</ul>
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={!approved.length} onClick={apply}>{t("confirm")}</Button>
          <Button type="button" onClick={() => setApproved(null)}>{t("cancel")}</Button>
        </div>
      </div>}
      {results.length > 0 && <div role="status"><h4>{t("results")}</h4><ul>{results.map(result => <li key={result.ordinal}>
        {rows.find(r => r.ordinal === result.ordinal)?.title}: {t(`resultsByState.${["stale", "failed", "ineligible", "pending", "conflict", "error", "imported", "dismissed"].includes(result.state) ? result.state : "failed"}`)}
      </li>)}</ul></div>}
    </fieldset>}
  </section>;
}

function PassComparison({ comparison, overwrite }: { comparison: ArchiveRowReview["comparisons"][number]; overwrite: boolean }) {
  const t = useTranslations("import.archive.recovery");
  return <div className="my-2 grid gap-2 text-sm sm:grid-cols-3">
    {(["finishedOn", "rating", "review"] as const).map(field => {
      const before = comparison.current?.[field] ?? null;
      const incoming = comparison.incoming[field];
      const effect = archiveFieldEffect(before, incoming, overwrite, field === "review");
      return <div key={field} className="min-w-0 break-words rounded border border-border p-2">
        <p className="font-semibold">{t(`fields.${field}`)} · {t(`effects.${effect}`)}</p>
        <p>{t("local")}</p><ReviewContent text={before == null || before === "" ? t("empty") : String(before)} />
        <p>{t("archive")}</p><ReviewContent text={incoming == null || incoming === "" ? t("empty") : String(incoming)} />
      </div>;
    })}
  </div>;
}
