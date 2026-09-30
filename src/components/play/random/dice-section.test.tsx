// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/es.json";

vi.mock("./stage/dice-stage", () => ({ DiceStage: () => null }));

import { DiceSection } from "./dice-section";

afterEach(cleanup);

describe("DiceSection", () => {
  it("da nombres distintos al chip de caras personalizadas y a su campo", () => {
    render(
      <NextIntlClientProvider locale="es" messages={messages}>
        <DiceSection lastRoll={undefined} onEmit={() => {}} />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Caras personalizadas" }));

    expect(screen.getByRole("button", { name: "Caras personalizadas" })).toBeTruthy();
    expect(screen.getByRole("spinbutton", { name: "Número de caras" })).toBeTruthy();
  });
});
