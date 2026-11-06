"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useReducer, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { loadSorteo, type SorteoLoad } from "@/lib/rincon/load-sorteo";
import { updateStatus } from "@/lib/library/manage-actions";
import { itemHref } from "@/lib/catalog/item-href";
import { formatDuration } from "@/lib/pace/format-duration";
import {
  antojosFor, BOOKCASE_MAX, DEFAULT_SETTINGS, eligibleItems, itemKey, normalizeSettings, pickIndex,
  sampleCandidates, shuffle,
  type Antojo, type SorteoSettings,
} from "./sorteo-logic";
import { lineFor, type CandidateLine } from "./sorteo-lines";
import { gameReducer, INITIAL_GAME, type Phase } from "./use-sorteo-game";
import { StageBookcase } from "./stage-bookcase";
import { StagePet, type Speech } from "./stage-pet";
import { StageTune, useAntojoLabel } from "./stage-tune";
import { StagePodium } from "./stage-podium";
import styles from "./sorteo-stage.module.css";

const SETTINGS_KEY = "sorteo:settings";
const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");
const SINCE = new Intl.DateTimeFormat("es", { month: "long", year: "numeric" });
const reducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
// Con movimiento reducido todas las esperas se acortan: la partida sigue, sin coreografía.
const ms = (n: number) => (reducedMotion() ? Math.min(n, 120) : n);
const ANY: Antojo = { id: "any", icon: "🎲" };

// Motas de polvo y confeti con valores deterministas ((i · primo) % n): el render
// tiene que ser puro (React Compiler), así que nada de Math.random aquí.
const MOTES = Array.from({ length: 14 }, (_, i) => ({
  left: `${(i * 37) % 100}%`,
  top: `${40 + ((i * 53) % 55)}%`,
  "--dx": `${((i * 29) % 40) - 20}px`,
  animationDuration: `${7 + (i % 7)}s`,
  animationDelay: `${-i}s`,
}) as CSSProperties);
const CONFETTI_COLORS = ["#cf8a54", "#e0a94a", "#6bb0b4", "#b592bd", "#d97a63", "#f0e8db"];
const CONFETTI = Array.from({ length: 46 }, (_, k) => ({
  left: `${(k * 37) % 100}%`,
  background: CONFETTI_COLORS[k % CONFETTI_COLORS.length],
  height: `${12 + ((k * 7) % 14)}px`,
  "--dy": `${500 + ((k * 53) % 300)}px`,
  "--rot": `${((k * 97) % 720) - 360}deg`,
  animationDuration: `${1.3 + ((k * 13) % 12) / 10}s`,
  animationDelay: `${((k * 7) % 4) / 10}s`,
}) as CSSProperties);

const PHASE_LABEL: Partial<Record<Phase, string>> = {
  roll: "roll", present: "present", discard: "discard", discarded: "discard", duel: "duel",
  duelLuck: "duel", duelPicked: "duel", reveal: "reveal", starting: "reveal", started: "reveal",
};

function readSettings(): SorteoSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? (JSON.parse(raw) as SorteoSettings) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

const without = (set: Set<string>, k: string) => { const n = new Set(set); n.delete(k); return n; };

// La partida (spec 2026-11-06). Un <dialog> nativo (foco atrapado y Escape) que
// se abre encima de la página de origen; al empezar algo cierra y refresca, así
// que el usuario se queda donde estaba.
//
// Temporizadores: los de la tirada y el telón viven en `timers` y se cancelan al
// cerrar; los de cada fase son de su efecto, y cerrar devuelve la partida a
// «loading», así que sus limpiezas los cancelan. `session` sube en cada cierre
// para que una respuesta de red tardía no toque una partida que ya no existe.
// Si algo se empezó en esta apertura, el refresco de la página lo hace el cierre
// (sea por el temporizador de «started», por ✕ o por Escape), una sola vez.
//
// Cierre: todo cierre programático pasa por closeStage(), que cierra el <dialog>
// y limpia en el acto. No se espera al evento nativo `close`: en Chrome real no
// siempre llega (visto con la pestaña en segundo plano), y sin él la marca
// sorteoOpen se quedaba puesta y el disparador no podía reabrir. El onClose del
// <dialog> sigue cubriendo los cierres del navegador (Escape); `shown` hace que
// la limpieza corra una sola vez por apertura aunque luego llegue el evento.
export function SorteoStage({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("sorteo");
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const timers = useRef<{ roll: Set<number>; curtain: number }>({ roll: new Set(), curtain: 0 });
  const session = useRef(0);
  const loadedFor = useRef(-1); // sesión cuya carga ya se lanzó (StrictMode remonta los efectos)
  const curtainDone = useRef(false);
  const startedOk = useRef(false);
  const shown = useRef(false); // hay una apertura viva que limpiar al cerrar
  const [game, dispatch] = useReducer(gameReducer, INITIAL_GAME);
  const [data, setData] = useState<SorteoLoad | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [settings, setSettings] = useState<SorteoSettings>(DEFAULT_SETTINGS);
  const [tuneOpen, setTuneOpen] = useState(false);
  const [curtainOpen, setCurtainOpen] = useState(false);
  const [tickKey, setTickKey] = useState<string | null>(null);
  const [pulled, setPulled] = useState<Set<string>>(() => new Set());
  const [taken, setTaken] = useState<Set<string>>(() => new Set());
  const [shakeSeq, setShakeSeq] = useState(0);
  const [luckFocus, setLuckFocus] = useState<number | null>(null);
  const [lines, setLines] = useState<Record<string, CandidateLine>>({});
  const [reaction, setReaction] = useState(0); // variante de la frase de reacción
  const antojoLabel = useAntojoLabel(settings.type);

  const later = useCallback((fn: () => void, wait: number) => {
    const bag = timers.current.roll;
    const id = window.setTimeout(() => { bag.delete(id); fn(); }, ms(wait));
    bag.add(id);
  }, []);
  const clearRollTimers = useCallback(() => {
    const bag = timers.current.roll;
    bag.forEach(clearTimeout);
    bag.clear();
  }, []);

  const pool = useMemo(() => data?.items ?? [], [data]);
  const eligible = useMemo(() => eligibleItems(pool, settings), [pool, settings]);
  const shelf = useMemo(
    () => order.map((k) => pool.find((i) => itemKey(i) === k)).filter((i): i is NonNullable<typeof i> => !!i),
    [order, pool]
  );
  const offKeys = useMemo(() => {
    const ok = new Set(eligible.map(itemKey));
    return new Set(shelf.map(itemKey).filter((k) => !ok.has(k)));
  }, [eligible, shelf]);

  const load = useCallback(async () => {
    const mine = session.current;
    try {
      const res = await loadSorteo();
      if (mine !== session.current) return;
      setData(res);
      setOrder(shuffle(res.items).slice(0, BOOKCASE_MAX).map(itemKey));
      setSettings(normalizeSettings(readSettings(), res.collections));
      dispatch({ type: "loaded", empty: res.items.length === 0 });
    } catch {
      if (mine === session.current) dispatch({ type: "failed" });
    }
  }, []);

  // Limpieza del cierre, idempotente: solo la primera llamada de cada apertura cuenta.
  function finishClose() {
    if (!shown.current) return;
    shown.current = false;
    session.current += 1;
    clearRollTimers();
    window.clearTimeout(timers.current.curtain);
    curtainDone.current = false;
    if (startedOk.current) {
      startedOk.current = false;
      router.refresh();
    }
    dispatch({ type: "reset" });
    setCurtainOpen(false); setTuneOpen(false); setTickKey(null); setLuckFocus(null);
    setPulled(new Set()); setTaken(new Set());
    delete document.documentElement.dataset.sorteoOpen;
    onClose();
  }

  function closeStage() {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    finishClose();
  }
  const closeFromEffect = useEffectEvent(closeStage);

  // Abrir: telón + carga en paralelo. El estado ya está limpio: lo deja así el
  // cierre (finishClose) o el montaje. El efecto es idempotente y simétrico
  // para que el remontaje de StrictMode (dev, e2e) no deje el telón echado:
  // showModal solo si hace falta, una carga por apertura, y la marca y el
  // temporizador del telón se rehacen en cada ejecución y se deshacen al limpiar.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!open) {
      if (dialog.open) closeFromEffect();
      return;
    }
    if (!dialog.open) dialog.showModal();
    shown.current = true;
    const root = document.documentElement;
    root.dataset.sorteoOpen = "";
    if (loadedFor.current !== session.current) {
      loadedFor.current = session.current;
      void load();
    }
    const tm = timers.current;
    if (!curtainDone.current) {
      window.clearTimeout(tm.curtain);
      tm.curtain = window.setTimeout(() => { curtainDone.current = true; setCurtainOpen(true); }, ms(700));
    }
    return () => {
      window.clearTimeout(tm.curtain);
      delete root.dataset.sorteoOpen;
    };
  }, [open, load]);

  useEffect(() => {
    const tm = timers.current;
    return () => {
      tm.roll.forEach(clearTimeout);
      tm.roll.clear();
    };
  }, []);

  function changeSettings(s: SorteoSettings) {
    setSettings(s);
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* sin almacenamiento: solo esta sesión */ }
  }

  // ---- tirada: barrido del foco y los tres que salen de la balda ----
  function roll() {
    if (eligible.length === 0) return;
    const candidates = sampleCandidates(eligible);
    const today = new Date();
    const fmt = { duration: formatDuration, since: (iso: string) => SINCE.format(new Date(iso)) };
    setLines(Object.fromEntries(candidates.map((c) => [itemKey(c), lineFor(c, today, fmt)])));
    setTuneOpen(false);
    setPulled(new Set()); setTaken(new Set());
    dispatch({ type: "roll", candidates });
    setShakeSeq((n) => n + 1);
    const live = shelf.filter((i) => !offKeys.has(itemKey(i))).map(itemKey);
    const takeOut = () => {
      candidates.forEach((c, k) => {
        later(() => setPulled((p) => new Set(p).add(itemKey(c))), k * 260);
        later(() => setTaken((p) => new Set(p).add(itemKey(c))), k * 260 + 420);
      });
      later(() => dispatch({ type: "rolled" }), 1150);
    };
    if (reducedMotion() || live.length === 0) { takeOut(); return; }
    let step = 0, delay = 45, elapsed = 0;
    const tick = () => {
      setTickKey(live[step % live.length]);
      step += 1; elapsed += delay; delay = Math.min(delay * 1.12, 200);
      if (elapsed < 1600) later(tick, delay);
      else { setTickKey(null); takeOut(); }
    };
    later(tick, 300);
  }

  function skipToDuel() {
    clearRollTimers();
    const kept = new Set(game.candidates.slice(0, 2).map(itemKey));
    setTickKey(null);
    setPulled(kept); setTaken(kept);
    dispatch({ type: "skipToDuel" });
  }

  function discard(index: number) {
    setReaction(pickIndex(3));
    dispatch({ type: "discard", index });
  }

  function confirmPick() {
    setReaction(pickIndex(2));
    dispatch({ type: "confirmPick" });
  }

  function luck() {
    setLuckFocus(null);
    dispatch({ type: "luck" });
  }

  function again() {
    setPulled(new Set()); setTaken(new Set()); setLuckFocus(null);
    dispatch({ type: "again" });
  }

  // ---- presentación: uno cada 2,3 s ----
  useEffect(() => {
    if (game.phase !== "present") return;
    const id = window.setTimeout(() => dispatch({ type: "presentNext" }), ms(game.presented === 0 ? 750 : 2300));
    return () => clearTimeout(id);
  }, [game.phase, game.presented]);

  // ---- descarte: el lomo vuelve a su hueco y, tras la reacción, duelo ----
  useEffect(() => {
    if (game.phase !== "discarded" || !game.discarded) return;
    const k = itemKey(game.discarded);
    const back = window.setTimeout(() => {
      setTaken((p) => without(p, k));
      setPulled((p) => without(p, k));
    }, ms(500));
    const next = window.setTimeout(() => dispatch({ type: "toDuel" }), ms(1300));
    return () => { clearTimeout(back); clearTimeout(next); };
  }, [game.phase, game.discarded]);

  // ---- duelo: la suerte oscila y frena; elegir tú espera un instante ----
  useEffect(() => {
    if (game.phase === "duelPicked") {
      // `win` no comprueba el índice en duelPicked: hay que pasar la elección.
      const index = game.duelPick ?? 0;
      const id = window.setTimeout(() => dispatch({ type: "win", index }), ms(700));
      return () => clearTimeout(id);
    }
    if (game.phase !== "duelLuck") return;
    const winner = pickIndex(2);
    if (reducedMotion()) {
      const id = window.setTimeout(() => dispatch({ type: "win", index: winner }), 120);
      return () => clearTimeout(id);
    }
    let s = 0, delay = 70, elapsed = 0;
    const flick = () => {
      const j = s % 2;
      setLuckFocus(j);
      s += 1; elapsed += delay; delay = Math.min(delay * 1.18, 520);
      const done = elapsed > 1700 && j === winner;
      id = window.setTimeout(done ? () => dispatch({ type: "win", index: winner }) : flick, done ? 650 : delay);
    };
    let id = window.setTimeout(flick, 0);
    return () => clearTimeout(id);
  }, [game.phase, game.duelPick]);

  // ---- CTA ----
  async function start() {
    const w = game.winner;
    if (!w) return;
    const mine = session.current;
    dispatch({ type: "start" });
    try {
      const outcome = await updateStatus(w.itemType, w.itemId, "in_progress");
      if (mine !== session.current) {
        // Cerró mientras esperaba: si se empezó, que la página lo refleje igualmente.
        if (outcome.kind === "done") router.refresh();
        return;
      }
      if (outcome.kind === "done") {
        startedOk.current = true;
        setReaction(pickIndex(2));
        dispatch({ type: "startDone" });
      } else {
        dispatch({ type: "startFailed" });
      }
    } catch {
      if (mine === session.current) dispatch({ type: "startFailed" });
    }
  }
  useEffect(() => {
    if (game.phase !== "started") return;
    // Cerrar basta: finishClose refresca porque startedOk está puesto.
    const id = window.setTimeout(() => closeFromEffect(), ms(1300));
    return () => clearTimeout(id);
  }, [game.phase]);

  // El foco de los candidatos se deriva de la fase: el que habla al presentar,
  // el que ilumina la suerte durante el sorteo, ninguno en el resto.
  const focusIndex =
    game.phase === "present" && game.presented > 0 ? game.presented - 1
      : game.phase === "duelLuck" ? luckFocus
        : null;

  // ---- voz ----
  const lineText = (key: string) => {
    const l = lines[key];
    return l ? t(`lines.${l.key}.${l.variant}`, l.values) : "";
  };
  const speech: Speech = (() => {
    switch (game.phase) {
      case "error": return { text: t("say.loadError"), mood: "sad" };
      case "choose": return { text: t("say.count", { count: eligible.length }), mood: eligible.length ? "idle" : "sad" };
      case "present": {
        const c = game.presented > 0 ? game.candidates[game.presented - 1] : null;
        return c ? { title: c.title, text: lineText(itemKey(c)), mood: "idle" } : null;
      }
      case "discard": return { text: t("say.discard"), mood: "idle" };
      case "discarded": return game.discarded ? { text: t(`say.discarded.${reaction % 3}`, { title: game.discarded.title }), mood: "sad" } : null;
      case "duel": return { text: t("say.duel"), mood: "idle" };
      case "duelPicked": return { text: t(`say.picked.${reaction % 2}`), mood: "joy" };
      case "reveal": case "starting":
        return game.winner
          ? { title: game.winner.title, text: game.solo ? `${t("say.solo")} ${lineText(itemKey(game.winner))}` : lineText(itemKey(game.winner)), mood: "joy" }
          : null;
      case "started": return { text: t(`say.started.${reaction % 2}`), mood: "joy" };
      default: return null;
    }
  })();

  // ---- controles por fase ----
  const phaseLabel = PHASE_LABEL[game.phase];
  const w = game.winner;
  const controls = (() => {
    switch (game.phase) {
      case "loading": return null;
      case "error": return <button type="button" className={cx(styles.cta, styles.big)} onClick={() => { dispatch({ type: "reload" }); void load(); }}>{t("retry")}</button>;
      case "empty": return (<><p className={styles.hint}>{t("emptyPool")}</p><Link href="/buscar" className={cx(styles.cta, styles.big)} onClick={closeStage}>{t("emptyCta")}</Link></>);
      case "choose": {
        // La píldora enseña el antojo activo (y el tipo si no es «Todo»), como el prototipo.
        const antojo = antojosFor(settings.type, data?.collections ?? []).find((a) => a.id === settings.antojo) ?? ANY;
        const label = settings.type === "all" ? antojoLabel(antojo) : `${t(`types.${settings.type}`)} · ${antojoLabel(antojo)}`;
        return (
          <div className={styles.mainbar}>
            <button type="button" className={styles.pill} aria-expanded={tuneOpen} onClick={() => setTuneOpen(true)}>
              <span className={styles.ic} aria-hidden>{antojo.icon}</span>
              <span><b>{label}</b><small>{t("inPlay", { count: eligible.length })} · {t("tuneHint")}</small></span>
              <span className={styles.chev} aria-hidden>▾</span>
            </button>
            <button type="button" className={cx(styles.cta, styles.big)} disabled={eligible.length === 0} onClick={roll}>{t("roll")}</button>
          </div>
        );
      }
      case "roll": return (<><p className={styles.hint}>{t("rolling")}</p><button type="button" className={styles.ghost} onClick={skipToDuel}>{t("skipToDuel")}</button></>);
      case "present": return (<><p className={styles.hint}>{t("presenting")}</p><button type="button" className={styles.ghost} onClick={() => dispatch({ type: "skipPresent" })}>{t("skipPresent")}</button></>);
      case "discard": case "discarded": return <p className={styles.hint}>{t("discardHint")}</p>;
      case "duel": case "duelLuck": case "duelPicked": {
        const picked = game.duelPick !== null ? game.candidates[game.duelPick] : null;
        const busy = game.phase !== "duel";
        return (<>
          <div className={styles.btnrow}>
            <button type="button" className={styles.cta} disabled={busy} onClick={luck}>{t("luck")}</button>
            <button type="button" className={styles.sec} disabled={busy || !picked} onClick={confirmPick}>
              {picked ? t("mineNamed", { title: picked.title }) : t("mine")}
            </button>
          </div>
          <p className={styles.hint}>{t("duelHint")}</p>
        </>);
      }
      case "reveal": case "starting": case "started":
        if (!w) return null;
        return (<>
          <div className={styles.result}>
            <h3>{w.title}</h3>
            <span className={styles.meta}>{w.subtitle ? `${w.subtitle} · ${w.metaText}` : w.metaText}</span>
            {w.estimateText && <span className={styles.est}>{w.estimateText}</span>}
          </div>
          {game.ctaError && <p className={styles.error}>{t("ctaError")}</p>}
          <button type="button" className={cx(styles.cta, styles.big)} disabled={game.phase !== "reveal"} onClick={start}>
            {game.phase === "starting" ? t("ctaPending") : game.phase === "started" ? t("ctaDone") : t(`cta.${w.itemType}`)}
          </button>
          <div className={styles.btnrow}>
            <button type="button" className={styles.sec} disabled={game.phase !== "reveal"} onClick={again}>{t("again")}</button>
            <Link href={itemHref(w.itemType, w.itemId)} className={styles.sec} onClick={closeStage}>{t("goToItem")}</Link>
          </div>
        </>);
    }
  })();

  const podium = !["loading", "error", "empty", "choose", "roll"].includes(game.phase);
  const reveal = game.phase === "reveal" || game.phase === "starting" || game.phase === "started";

  return (
    <dialog
      ref={dialogRef}
      className={styles.stage}
      aria-label={t("title")}
      onClose={finishClose}
      onCancel={(e) => { if (tuneOpen) { e.preventDefault(); setTuneOpen(false); } }}
    >
      <div className={cx(styles.st, reveal && styles.compact)}>
        <div className={cx(styles.curtain, curtainOpen && styles.open, curtainOpen && game.phase !== "loading" && styles.gone)} aria-hidden>
          <i /><i /><div className={styles.lbl}>{t("title")}</div>
        </div>
        <div className={styles["st-head"]}>
          <div><h2>{t("title")}</h2>{phaseLabel && <span className={styles.phase}>{t(`phase.${phaseLabel}`)}</span>}</div>
          <button type="button" className={styles["icon-btn"]} aria-label={t("close")}
            onClick={() => (tuneOpen ? setTuneOpen(false) : closeStage())}>✕</button>
        </div>
        <div className={cx(styles.scene, game.phase === "choose" && styles.choosing)}>
          <div className={styles.glow} aria-hidden />
          <div className={styles.motes} aria-hidden>
            {MOTES.map((style, i) => <i key={i} style={style} />)}
          </div>
          <div className={styles.floor} aria-hidden />
          <StageBookcase items={shelf} offKeys={offKeys} tickKey={tickKey} pulledKeys={pulled} takenKeys={taken}
            lit={tickKey !== null} dim={podium} shakeSeq={shakeSeq} choosing={game.phase === "choose"}>
            <StagePet pet={data?.pet ?? null} speech={tuneOpen ? null : speech} entered={curtainOpen && game.phase !== "loading"} />
          </StageBookcase>
          {podium && (
            <StagePodium phase={game.phase} candidates={game.candidates} presented={game.presented}
              focusIndex={focusIndex} duelPick={game.duelPick} winner={game.winner}
              onDiscard={discard} onPick={(index) => dispatch({ type: "pick", index })} />
          )}
          {reveal && (
            <div className={styles.confetti} aria-hidden>
              {CONFETTI.map((style, i) => <i key={i} style={style} />)}
            </div>
          )}
        </div>
        <div className={styles.ctrl}>{controls}</div>
        {data && (
          <StageTune open={tuneOpen} pool={pool} collections={data.collections} settings={settings}
            onChange={changeSettings} onDone={() => setTuneOpen(false)} />
        )}
      </div>
    </dialog>
  );
}
