// Bloques de los layouts del wrap-up v2 (spec 2026-10-13 §3). Sin estado: el texto
// llega escrito en el PosterModel. Lo decorativo (copia del bucle, casillas) va
// fuera del árbol accesible; cada gráfica se lee por su resumen.
import type { CSSProperties } from "react";
import { UserAvatar } from "@/components/social/user-avatar";
import type { PosterModel } from "@/lib/wrap-ups/view-models";
import { storyDurationMs } from "@/lib/wrap-ups/view-models";
import { PosterCover } from "./poster-cover";
import styles from "./poster.module.css";

export function CoverGrid({ model }: { model: PosterModel }) {
  const covers = model.covers ?? [];
  const mode = model.coverGrid ?? "static";
  const big = covers.length <= 4;
  const list = (hidden: boolean) => (
    <ul data-grid={mode} aria-hidden={hidden || undefined} className={styles.coverGrid} data-big={big}>
      {covers.map((c) => <PosterCover key={`${c.type}-${c.id}`} item={c} eager />)}
    </ul>
  );
  if (mode === "static") return list(false);
  return (
    <>
      <div className={styles.coverScroller} style={{ "--scroll-ms": `${storyDurationMs(model)}ms` } as CSSProperties}>
        <div className={styles.coverTrack}>
          {list(false)}
          {list(true)}
        </div>
        {model.reducedMoreLine && <p className={`${styles.plate} ${styles.reducedOnly}`}>{model.reducedMoreLine}</p>}
      </div>
      {model.moreLine && <p className={`${styles.plate} ${styles.motionOnly}`}>{model.moreLine}</p>}
    </>
  );
}

export function ProgressList({ rows }: { rows: NonNullable<PosterModel["progress"]> }) {
  return (
    <ul className={`${styles.plate} ${styles.progressList}`} data-big={rows.length <= 2}>
      {rows.map((r) => (
        <li key={`${r.item.type}-${r.item.id}`} className={styles.progressRow} data-touched={r.touched}>
          <ul className={styles.progressCover} aria-hidden="true"><PosterCover item={r.item} /></ul>
          <div className={styles.progressText}>
            <p className={styles.progressTitle}>{r.label}</p>
            {r.percent != null && (
              <div role="progressbar" aria-label={r.item.title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={r.percent}
                className={styles.progressBar}>
                <span style={{ width: `${r.percent}%` }} />
              </div>
            )}
            {!r.touched && r.idleLabel && <p className={styles.progressIdle}>{r.idleLabel}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function RhythmCharts({ model }: { model: PosterModel }) {
  const { calendar, heatmaps = [] } = model;
  return (
    <>
      {calendar && (
        <div role="img" aria-label={calendar.summary} className={`${styles.plate} ${styles.calendar}`}>
          {[..."LMXJVSD"].map((d, i) => <span key={`h${i}`} className={styles.calendarHead} aria-hidden="true">{d}</span>)}
          {Array.from({ length: calendar.offset }, (_, i) => <span key={`e${i}`} aria-hidden="true" />)}
          {calendar.days.map((d) => (
            <span key={d.day} className={styles.calendarDay} data-active={d.active} aria-hidden="true">{d.day}</span>
          ))}
        </div>
      )}
      {heatmaps.map((h) => (
        <div key={h.title} className={`${styles.plate} ${styles.heatmap}`}>
          <p className={styles.heatTitle} aria-hidden="true">{h.title}</p>
          <div role="img" aria-label={h.summary} className={styles.heatRow} style={{ "--cells": h.cells.length } as CSSProperties}>
            {h.cells.map((c, i) => (
              <span key={i} className={styles.heatCell} data-level={c.level} data-peak={c.peak} aria-hidden="true">
                <span className={styles.heatMark} />
                <span className={styles.heatLabel}>{c.label}</span>
              </span>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

export function TogetherBlock({ data }: { data: NonNullable<PosterModel["together"]> }) {
  const single = data.viewings.length === 0 || data.clubs.length === 0;
  return (
    <div className={styles.together} data-single={single}>
      {data.viewings.length > 0 && (
        <section className={`${styles.plate} ${styles.togetherSection}`}>
          <h3 className={styles.togetherTitle}>{data.viewingsTitle}</h3>
          <ul className={styles.togetherList}>
            {data.viewings.map((v) => (
              <li key={`${v.item.type}-${v.item.id}-${v.watchedOn}`} className={styles.togetherRow}>
                <ul className={styles.progressCover} aria-hidden="true"><PosterCover item={v.item} /></ul>
                <div className={styles.progressText}>
                  <p className={styles.progressTitle}>{v.item.title}</p>
                  {v.companions.length > 0 && (
                    <div className={styles.togetherPeople}>
                      <span className={styles.avatars} aria-hidden="true">
                        {v.companions.map((c) => <UserAvatar key={c.userId} name={c.displayName ?? c.username} avatarUrl={c.avatarUrl} size={28} />)}
                        {v.extra > 0 && <span className={styles.avatarMore}>+{v.extra}</span>}
                      </span>
                      {v.peopleLine && <p>{v.peopleLine}</p>}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {data.clubs.length > 0 && (
        <section className={`${styles.plate} ${styles.togetherSection}`}>
          <h3 className={styles.togetherTitle}>{data.clubsTitle}</h3>
          <ul className={styles.togetherList}>
            {data.clubs.map((c) => (
              <li key={c.clubId} className={styles.clubRow}>
                <span className={styles.clubName}>{c.name}</span>
                <span className={styles.clubValue}>{c.value}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
