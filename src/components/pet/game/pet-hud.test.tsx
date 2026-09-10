// @vitest-environment jsdom
// Cubre el componente REAL (no el mock de pet-game.test.tsx): el mock replica a
// mano lo que `PetScene` debería pintar, así que si el componente real se
// desvía (p. ej. alguien vuelve a fijar `--scene-src` en línea) el mock seguiría
// en verde y el bug pasaría desapercibido. Este test renderiza `PetScene` tal
// cual.
import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/es.json";
import { PetScene } from "./pet-hud";
import { EMPTY_COUNTS } from "@/lib/pet/counts";
import type { PetSnapshot } from "@/lib/pet/get-pet-snapshot";
import { campScene } from "@/lib/pet/shop/catalog";

const pet: PetSnapshot = {
  name: "Nuez", petClass: "wizard", hatchedAt: "2026-09-01T00:00:00Z", hidden: false,
  counts: EMPTY_COUNTS, attributes: { FUE: 0, CON: 0, INT: 0, SAB: 0, CAR: 0, DES: 0 },
  xp: 0, level: 1, levelFloorXp: 0, nextLevelXp: 100, stage: "acorn", mood: "happy",
  lastActivityISO: null, leveledUp: false, evolved: false, missions: [], achievements: [],
  missionsCompletedNow: false, achievementsUnlockedNow: false,
};

function withIntl(node: ReactNode) {
  return <NextIntlClientProvider locale="es" messages={messages}>{node}</NextIntlClientProvider>;
}

afterEach(() => cleanup());

it("pinta las dos parejas de la escena comprada y NUNCA --scene-src en linea", () => {
  const scene = campScene("creek");
  render(withIntl(<PetScene pet={pet} scene={scene} />));
  const style = screen.getByTestId("pet-scene").style;
  expect(style.getPropertyValue("--scene-portrait-src")).toContain("camp-creek.webp");
  expect(style.getPropertyValue("--scene-portrait-w")).toBe(String(scene.width));
  expect(style.getPropertyValue("--scene-portrait-h")).toBe(String(scene.height));
  expect(style.getPropertyValue("--scene-wide-src")).toContain("camp-creek-wide.webp");
  expect(style.getPropertyValue("--scene-wide-w")).toBe(String(scene.wide.width));
  expect(style.getPropertyValue("--scene-wide-h")).toBe(String(scene.wide.height));
  // La regresion exacta que corrige esta tarea: si el estilo en linea declarase
  // `--scene-src`, pisaria siempre a la media query de escritorio y la lamina
  // vertical saldria tambien en pantallas anchas.
  expect(style.getPropertyValue("--scene-src")).toBe("");
});

it("sin fondo comprado no fija ninguna variable de escena en linea", () => {
  render(withIntl(<PetScene pet={pet} scene={null} />));
  const style = screen.getByTestId("pet-scene").style;
  expect(style.getPropertyValue("--scene-portrait-src")).toBe("");
  expect(style.getPropertyValue("--scene-wide-src")).toBe("");
  expect(style.getPropertyValue("--scene-src")).toBe("");
});
