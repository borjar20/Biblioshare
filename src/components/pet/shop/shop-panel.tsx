"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CAMP_SCENES, DEFAULT_SCENE_ID, scenePrice } from "@/lib/pet/shop/catalog";
import { buyCosmetic, claimAcorns, setCampScene } from "@/lib/pet/shop/actions";
import type { ShopState } from "@/lib/pet/shop/types";
import styles from "./shop-panel.module.css";

const defaultActions = { claim: claimAcorns, buy: buyCosmetic, setScene: setCampScene };

/** Prefijo de las claves de hecho diario ("day:2026-09-11"): se deriva su
 * longitud del propio prefijo en vez de escribir el 4 a mano. */
const DAY_KEY_PREFIX = "day:";

export function ShopPanel({ state: initial, onClose, actions = defaultActions }: {
  state: ShopState;
  onClose: () => void;
  actions?: { claim: typeof claimAcorns; buy: typeof buyCosmetic; setScene: typeof setCampScene };
}) {
  const t = useTranslations("pet.shop");
  // Mismo patrón que equipment-panel: el valor local manda mientras el prop
  // base no haya cambiado; si la página revalida con un `state` nuevo, gana el prop.
  const [saved, setSaved] = useState<{ base: ShopState; value: ShopState } | null>(null);
  const [claimed, setClaimed] = useState<{ total: number; parts: string[] } | null>(null);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const state = saved?.base === initial ? saved.value : initial;

  async function run(work: () => Promise<{ ok: true; state: ShopState } | { ok: false; code: string }>) {
    if (busy.current) return null;
    busy.current = true; setPending(true); setError(false);
    try {
      const response = await work();
      if (response.ok) { setSaved({ base: initial, value: response.state }); return response; }
      setError(true); return null;
    } catch { setError(true); return null; }
    finally { busy.current = false; setPending(false); }
  }

  async function claim() {
    setClaimed(null);
    const response = await run(async () => {
      const result = await actions.claim();
      return result.ok ? { ok: true as const, state: result.state, entries: result.entries } : result;
    }) as { ok: true; state: ShopState; entries: { kind: string; key: string; amount: number }[] } | null;
    if (!response) return;
    setClaimed({
      total: response.entries.reduce((sum, entry) => sum + entry.amount, 0),
      parts: response.entries.map(entry => `+${entry.amount} ${t(`sources.${entry.kind}`, { day: entry.key.slice(DAY_KEY_PREFIX.length) })}`),
    });
  }

  return <section className={styles.panel} aria-labelledby="pet-shop-title" data-testid="pet-shop" aria-busy={pending}>
    <header>
      <h3 id="pet-shop-title">{t("title")}</h3>
      <button type="button" className={styles.close} onClick={onClose}>{t("close")}</button>
    </header>
    <p className={styles.balance} data-testid="acorn-balance">{t("balance", { count: state.balance })}</p>
    <button type="button" className={styles.claim} disabled={pending || !state.pending.length} onClick={claim}>
      {state.pending.length ? t("claim", { count: state.pending.length }) : t("claimEmpty")}
    </button>
    <p className={styles.help}>{t("claimHelp")}</p>
    <p role="status" aria-live="polite" className={styles.status} data-error={error || undefined}>
      {error ? t("error") : claimed ? `${t("claimed", { total: claimed.total })} · ${claimed.parts.join(" · ")}` : ""}
    </p>
    <ul className={styles.grid}>
      {CAMP_SCENES.map(scene => {
        const owned = scene.id === DEFAULT_SCENE_ID || state.owned.includes(scene.id);
        const active = (state.scene ?? DEFAULT_SCENE_ID) === scene.id;
        const price = scenePrice(scene.id);
        const missing = price - state.balance;
        const name = t(`scenes.${scene.id}`);
        return <li key={scene.id} data-testid={`scene-${scene.id}`} className={styles.card} data-owned={owned} data-active={active}>
          {/* eslint-disable-next-line @next/next/no-img-element -- escena de píxel servida a escala entera */}
          <img src={`/pet/scenes/${scene.file}`} width={scene.width} height={scene.height} alt="" className={styles.thumb} />
          <strong>{name}</strong>
          {active ? <span className={styles.active}>{t("active")}</span>
            : owned ? <button type="button" disabled={pending} aria-label={t("useAria", { name })} onClick={() => run(() => actions.setScene(scene.id))}>{t("use")}</button>
            : missing > 0 ? <span className={styles.missing}>{t("missing", { count: missing })}</span>
            : <button type="button" disabled={pending} aria-label={t("buyAria", { name, price })} onClick={() => run(() => actions.buy(scene.id))}>{t("buy", { price })}</button>}
        </li>;
      })}
    </ul>
  </section>;
}
