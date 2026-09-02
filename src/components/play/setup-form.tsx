"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { makeEvent } from "@/lib/play/core/events";
import { useActiveGame } from "@/lib/play/core/use-active-game";
import { usePlayers } from "@/lib/play/core/use-players";
import { modeConfig, MTG_MODE_IDS, type MtgMode } from "@/lib/play/mtg/modes";
import { rememberTable, rotateStartingSeat } from "@/lib/play/ui/table-memory";
import { CARD_BACKGROUND_IDS, seatAccent } from "@/lib/play/ui/seats";
import { HoldRepeatButton } from "@/components/play/ui/hold-repeat-button";
import {
  addCommander,
  addPlayer,
  assignRegular,
  assignSelf,
  draftFromSetup,
  newDraft,
  removeCommander,
  removePlayer,
  toSetup,
  updateCommander,
  updatePlayer,
  type SetupDraft,
} from "@/lib/play/ui/setup-draft";
import { buttonVariants } from "@/components/ui/button";
import { RegularPicker } from "./regular-picker";
import { SeatRow } from "./ui/seat-row";
import { SeatToken, initials } from "./ui/seat-token";
import { useRememberedTable } from "./use-remembered-table";

const FIELD =
  "w-full rounded-chip border border-border bg-background px-2.5 py-1.5 text-[13px] text-foreground placeholder:text-muted-foreground";

const LIFE_CHIPS = [20, 30, 40] as const;
const LIFE_MIN = 1;
const LIFE_MAX = 999;

function parseMode(value: string | null): MtgMode {
  return MTG_MODE_IDS.includes(value as MtgMode) ? (value as MtgMode) : "commander";
}

/**
 * Configuración de partida. Tres cosas la gobiernan:
 *
 * 1. **Configurar es OPCIONAL, y el orden de la pantalla lo dice.** «Empezar» va
 *    arriba, activo desde el primer píxel; nombres y mazos viven plegados debajo.
 *    Antes el botón quedaba bajo cuatro tarjetas de campos y la pantalla entera se
 *    leía como un formulario que rellenar (revisión UX 2026-08-30) — el aviso de
 *    «puedes empezar sin escribir nada» estaba DESPUÉS del botón que justificaba.
 * 2. **La fricción está en la segunda partida.** Por eso «Revancha» trae la mesa
 *    entera puesta y pasa por AQUÍ en vez de arrancar sola: entre dos partidas casi
 *    siempre cambia algo, y corregirlo con la partida ya empezada es peor. La fila
 *    de fichas ya enseña los nombres sin abrir nada: no hace falta desplegar un
 *    panel por asiento para decidir si hay que tocarlo.
 * 3. El color de asiento se reparte aquí para que el salto al tablero no sorprenda:
 *    el que era ciruela en la lista es ciruela en la mesa. Y el orden de esta lista
 *    ES el orden de turnos.
 */
export function SetupForm({ identity, selfName }: { identity: string; selfName?: string }) {
  const t = useTranslations("play");
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = parseMode(searchParams.get("modo"));
  const isRematch = searchParams.get("revancha") === "1";
  // Reconfigurar desde la hoja de partida: misma mesa prefijada que la
  // revancha pero SIN rotar el asiento inicial — se viene a corregir un fallo
  // del setup, no a empezar la siguiente (revisión 2026-08-31). Entrar no
  // descarta nada; «Empezar» es lo que reinicia.
  const isReconfigure = searchParams.get("reconfigurar") === "1";
  // `?jugadores=` conserva la elección hecha en el hub: elegir 5 allí y abrir esto
  // con 4 sería desdecirse. `newDraft` acota el número a lo que el modo admite.
  // Sin parámetro tiene que quedar `undefined`, no `Number(null) === 0`: un 0 se
  // acotaría al mínimo del modo y abriría la mesa con 2 en vez de con 4.
  const rawPlayers = searchParams.get("jugadores");
  const requestedPlayers = rawPlayers === null ? undefined : Number(rawPlayers);
  const config = modeConfig(mode);

  const remembered = useRememberedTable(identity);
  const { snapshot, store } = useActiveGame(identity);

  // La mesa recordada llega DESPUÉS de hidratar (vive en localStorage), así que no
  // se puede sembrar el `useState` con ella. En vez de sincronizar con un efecto
  // —prohibido por lint y con un primer render equivocado—, el borrador se DERIVA
  // mientras nadie ha tocado nada, y el estado toma el mando en la primera edición.
  const base = useMemo<SetupDraft>(() => {
    if (isReconfigure && remembered && remembered.mode === mode) {
      return draftFromSetup(remembered);
    }
    if (isRematch && remembered && remembered.mode === mode) {
      return draftFromSetup(rotateStartingSeat(remembered));
    }
    return newDraft(
      mode,
      requestedPlayers !== undefined && Number.isInteger(requestedPlayers)
        ? requestedPlayers
        : undefined,
    );
  }, [isRematch, isReconfigure, remembered, mode, requestedPlayers]);

  const [edited, setEdited] = useState<SetupDraft | null>(null);
  const draft = edited ?? base;

  // UNA sola suscripción al espejo de habituales por pantalla: se baja por
  // props a cada `RegularPicker` en vez de que cada asiento monte la suya.
  const { players: regulars, loaded: regularsLoaded } = usePlayers(identity);

  // Degradación de prefill (spec §6): un asiento que llega con `playerId` de
  // una mesa recordada/revancha/reconfiguración pero cuyo habitual ya no
  // existe (lo borraron en otro dispositivo) se limpia a invitado
  // conservando el nombre. Corre UNA sola vez por hidratación -- el ref
  // evita repetirse en cada reload() del espejo y pisar ediciones del
  // usuario -- y solo cuando el espejo YA respondió: antes de eso `regulars`
  // está vacío por estar cargando, no porque no haya habituales, y degradar
  // ahí borraría asignaciones válidas.
  const degradedRef = useRef(false);
  useEffect(() => {
    degradedRef.current = false;
  }, [base]);
  useEffect(() => {
    // Espejo VACÍO es indistinguible de espejo frío (IDB evacuada con los
    // habituales sanos en el servidor): con [] no se degrada nada y el ref no
    // se consume, así que cuando el pull puebla el espejo y el canal refresca,
    // esta pasada vuelve a correr contra la lista real (review final fase 6).
    if (!regularsLoaded || regulars.length === 0 || degradedRef.current) return;
    degradedRef.current = true;
    const ids = new Set(regulars.map((r) => r.playerId));
    const current = edited ?? base;
    if (current.players.some((p) => p.playerId && !ids.has(p.playerId))) {
      setEdited({
        ...current,
        players: current.players.map((p) =>
          p.playerId && !ids.has(p.playerId) ? { ...p, playerId: undefined } : p,
        ),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- degradedRef guarda la única corrida por hidratación
  }, [regularsLoaded, regulars, base]);

  const takenIds = draft.players
    .map((p) => p.playerId)
    .filter((id): id is string => id !== undefined);

  const [openSeat, setOpenSeat] = useState<string | null>(null);
  const openIndex = draft.players.findIndex((p) => p.id === openSeat);
  const [lifePreview, setLifePreview] = useState(0);
  const clampLife = (n: number) => Math.min(LIFE_MAX, Math.max(LIFE_MIN, n));
  const commitLife = (total: number) => {
    setEdited({ ...draft, startingLife: clampLife(draft.startingLife + total) });
    setLifePreview(0);
  };
  const shownLife = clampLife(draft.startingLife + lifePreview);
  const availableRegulars = regulars.filter((r) => !takenIds.includes(r.playerId));

  function seatRegular(regular: { playerId: string; name: string }) {
    const free = draft.players.findIndex(
      (p) => p.name.trim() === "" && p.playerId === undefined && p.userId === undefined,
    );
    if (free >= 0) {
      setEdited(assignRegular(draft, free, regular));
      return;
    }
    const grown = addPlayer(draft);
    if (grown === draft) return;
    setEdited(assignRegular(grown, grown.players.length - 1, regular));
  }

  function addSeat() {
    const grown = addPlayer(draft);
    if (grown === draft) return;
    setEdited(grown);
    setOpenSeat(grown.players[grown.players.length - 1].id);
  }

  // Tu propia cuenta como asiento (issue #985): un solo «Yo» por mesa. El
  // nombre viene del perfil (server) y cae a la etiqueta «Yo» si no hay.
  const selfSeated = draft.players.some((p) => p.userId === identity);
  const self =
    identity !== "anon" && !selfSeated
      ? { userId: identity, name: (selfName ?? "").trim() || t("players.self") }
      : undefined;

  const seatName = (index: number) =>
    draft.players[index].name.trim() || t("setup.playerN", { n: index + 1 });

  function start() {
    // Con el store hidratando no se arranca: podría pisar una activa aún no
    // leída (spec fase 3 §3). El botón va deshabilitado; esto es el cinturón.
    if (snapshot.status === "loading") return;
    const setup = toSetup(draft, (i) => t("setup.playerN", { n: i + 1 }));
    // Una sola partida activa (spec §4): `start()` LANZA si ya hay una, así que la
    // vieja se descarta aquí — pulsar «Empezar» ES pedir sustituirla, y es lo que
    // hace que la revancha no borre nada hasta que la siguiente arranca de verdad.
    if (snapshot.game) store.discard();
    if (!store.start(makeEvent("game_started", { toolId: "mtg" as const, setup }, Date.now()))) {
      return; // setup que el motor rechaza: no se navega a un tablero que no existe
    }
    // La mesa se recuerda AL EMPEZAR, no al terminar: así sobrevive a descartar.
    rememberTable(identity, setup);
    router.push("/partida/activa");
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="font-serif text-[24px] font-semibold">{t("setup.title")}</h1>
        <p className="mt-0.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          {t("setup.modeAndLife", {
            mode: t(`tools.mtg.modes.${mode}.name`),
            life: draft.startingLife,
          })}
        </p>
      </header>

      {/* El botón ANTES que la mesa: empezar no exige tocarla. */}
      <div>
        <button
          type="button"
          onClick={start}
          disabled={snapshot.status === "loading"}
          className={buttonVariants("primary", "w-full justify-center py-3 text-[15px]")}
        >
          {t("setup.start")}
        </button>
        <p className="mt-2 text-[12px] text-muted-foreground">
          {isRematch && remembered
            ? t("setup.rematchSeat", { name: seatName(draft.startingSeat) })
            : t("setup.emptyIsFine")}
        </p>
      </div>

      {/* La mesa como fichas: el número de jugadores ES el número de fichas.
          Tocar una abre SU panel; antes eran 3-4 campos por asiento y el
          pliegue abría desplegado en revancha (14 controles con cuatro). */}
      <section>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {t("setup.players")}
        </p>
        <SeatRow
          seats={draft.players.map((p, i) => ({
            id: p.id,
            caption: seatName(i),
            content: p.name.trim() === "" ? i + 1 : initials(p.name),
            selected: p.id === openSeat,
          }))}
          onSeatTap={(id) => setOpenSeat(id === openSeat ? null : id)}
          panelId="mtg-seat"
          regulars={availableRegulars}
          onSeatRegular={seatRegular}
          canAdd={draft.players.length < config.maxPlayers}
          canSeatRegulars={
            draft.players.length < config.maxPlayers ||
            draft.players.some((p) => p.name.trim() === "" && !p.playerId && !p.userId)
          }
          onAdd={addSeat}
          addControls="mtg-seat"
        />

        {openIndex >= 0 ? (
          <div id="mtg-seat" className="mt-3 flex flex-col gap-2 rounded-card border border-border bg-surface p-3">
            <div className="flex items-center gap-2">
              <input
                key={draft.players[openIndex].id}
                autoFocus
                value={draft.players[openIndex].name}
                onChange={(e) => setEdited(updatePlayer(draft, openIndex, { name: e.target.value }))}
                placeholder={t("setup.playerN", { n: openIndex + 1 })}
                aria-label={t("setup.name")}
                className={`${FIELD} min-w-0 font-serif text-[15px] font-semibold`}
              />
              {config.minPlayers !== config.maxPlayers ? (
                <button
                  type="button"
                  disabled={draft.players.length <= config.minPlayers}
                  onClick={() => {
                    setEdited(removePlayer(draft, openIndex));
                    setOpenSeat(null);
                  }}
                  className="tap-44 shrink-0 rounded-chip border border-border px-3 py-1.5 text-[13px] text-muted-foreground disabled:opacity-40"
                >
                  {t("seats.removeSeat")}
                </button>
              ) : null}
            </div>
            <RegularPicker
              identity={identity}
              players={regulars}
              takenIds={takenIds}
              query={draft.players[openIndex].name}
              assigned={
                draft.players[openIndex].playerId !== undefined ||
                draft.players[openIndex].userId !== undefined
              }
              onPick={(regular) => setEdited(assignRegular(draft, openIndex, regular))}
              onRemembered={(regular) => setEdited(assignRegular(draft, openIndex, regular))}
              self={self}
              onPickSelf={(me) => setEdited(assignSelf(draft, openIndex, me))}
              suggestOnEmpty={false}
            />
            <input
              value={draft.players[openIndex].deckName}
              onChange={(e) => setEdited(updatePlayer(draft, openIndex, { deckName: e.target.value }))}
              placeholder={t("setup.noDeck")}
              aria-label={t("setup.deck")}
              className={FIELD}
            />
            {draft.players[openIndex].commanders.map((commander, j) => (
              <div key={commander.id} className="flex gap-1.5">
                <input
                  value={commander.name}
                  onChange={(e) => setEdited(updateCommander(draft, openIndex, j, e.target.value))}
                  placeholder={t("setup.noCommander")}
                  aria-label={t("setup.commanderN", { n: j + 1 })}
                  className={FIELD}
                />
                {draft.players[openIndex].commanders.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setEdited(removeCommander(draft, openIndex, j))}
                    aria-label={t("setup.removeCommander")}
                    className="tap-44 h-11 w-11 shrink-0 rounded-chip border border-border text-[16px] text-muted-foreground"
                  >
                    −
                  </button>
                )}
              </div>
            ))}
            {draft.players[openIndex].commanders.length < config.maxCommanders && (
              <button
                type="button"
                onClick={() => setEdited(addCommander(draft, openIndex))}
                className="tap-44 self-start font-mono text-[10px] uppercase tracking-widest text-accent-ink"
              >
                + {t("setup.addCommander")}
              </button>
            )}
            {/* El fondo se elige AQUÍ: viaja en game_started y no hay evento
                para cambiarlo después (#943). Referencia, nunca bytes (#942). */}
            <div className="flex gap-2 pt-1" role="group" aria-label={t("setup.background")}>
              {CARD_BACKGROUND_IDS.map((id, tint) => {
                const chosen = (draft.players[openIndex].cardBackground ?? `seat-${openIndex + 1}`) === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setEdited(updatePlayer(draft, openIndex, { cardBackground: id }))}
                    aria-label={t("setup.backgroundN", { n: tint + 1 })}
                    aria-pressed={chosen}
                    className={`h-11 w-11 rounded-chip ${seatAccent(tint).tint} ${
                      chosen ? `ring-2 ${seatAccent(tint).ring}` : ""
                    }`}
                  />
                );
              })}
            </div>
          </div>
        ) : null}
      </section>

      {/* Vidas: chips de los tres valores de siempre + stepper con mantener. */}
      <section>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {t("setup.startingLife")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {LIFE_CHIPS.map((life) => (
            <button
              key={life}
              type="button"
              aria-pressed={draft.startingLife === life}
              onClick={() => setEdited({ ...draft, startingLife: life })}
              className={`tap-44 h-11 min-w-11 rounded-chip border px-3 font-mono text-[15px] tabular-nums transition-colors ${
                draft.startingLife === life ? "border-accent bg-accent/10 text-accent-ink" : "border-border bg-surface"
              }`}
            >
              {life}
            </button>
          ))}
          <span className="ml-auto inline-flex items-center gap-1">
            <HoldRepeatButton
              direction={-1}
              label={t("setup.lifeFewer")}
              disabled={draft.startingLife <= LIFE_MIN}
              onPreview={setLifePreview}
              onCommit={commitLife}
            />
            {/* Sin aria-live: con Cache Components el DOM de esta pantalla queda congelado
                y oculto tras el router.push a /partida/activa, y una región viva aquí se
                cuela en el recuento de aria-live del e2e del tablero (issue #1003). */}
            <span className="w-14 text-center font-serif text-[22px] font-semibold tabular-nums">
              {shownLife}
            </span>
            <HoldRepeatButton
              direction={1}
              label={t("setup.lifeMore")}
              disabled={draft.startingLife >= LIFE_MAX}
              onPreview={setLifePreview}
              onCommit={commitLife}
            />
          </span>
        </div>
      </section>

      {/* Quién empieza: la misma fila de fichas, en pequeño; la elegida con halo. */}
      <section>
        <p id="mtg-starting-seat" className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {t("setup.startingSeat")}
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby="mtg-starting-seat">
          {draft.players.map((p, i) => (
            <SeatToken
              key={p.id}
              variant="seat"
              seat={i}
              size="sm"
              caption={seatName(i)}
              label={t("setup.startsWith", { name: seatName(i) })}
              selected={draft.startingSeat === i}
              pressed={draft.startingSeat === i}
              onClick={() => setEdited({ ...draft, startingSeat: i })}
            >
              {p.name.trim() === "" ? i + 1 : initials(p.name)}
            </SeatToken>
          ))}
        </div>
      </section>
    </div>
  );
}
