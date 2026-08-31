"use client";

import styles from "./stage.module.css";

/** Orden de juego en cascada numerada. `key` por id de evento re-lanza la animación. */
export function OrderReveal({ id, order }: { id: string; order: string[] }) {
  return (
    <ol key={id} data-testid="players-result" className="mt-4 space-y-1" aria-live="polite">
      {order.map((name, i) => (
        <li
          key={name}
          className={`${styles.reveal} text-[16px] font-semibold`}
          style={{ animationDelay: `${i * 120}ms` }}
        >
          <span className="font-serif">{i + 1}.</span> {name}
        </li>
      ))}
    </ol>
  );
}
