"use client";

import styles from "./stage.module.css";

/** Equipos como tarjetas que se voltean, agrupadas y coloreadas por equipo. */
export function TeamsReveal({
  id,
  teams,
  teamLabel,
}: {
  id: string;
  teams: string[][];
  teamLabel: (n: number) => string;
}) {
  return (
    <div key={id} data-testid="players-result" className="mt-4 space-y-3" aria-live="polite">
      {teams.map((team, ti) => (
        <div key={ti}>
          <p
            className="text-[12px] font-semibold uppercase tracking-widest"
            style={{ color: `var(--play-seat-${(ti % 6) + 1})` }}
          >
            {teamLabel(ti + 1)}
          </p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {team.map((name, ni) => (
              <li
                key={name}
                className={`${styles.card} rounded-chip border px-3 py-1 text-[14px] font-semibold`}
                style={{
                  borderColor: `var(--play-seat-${(ti % 6) + 1})`,
                  animationDelay: `${(ti * team.length + ni) * 100}ms`,
                }}
              >
                {name}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
