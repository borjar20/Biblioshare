// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import { ReviewRow } from "./review-row";
import { ReviewSpoilerField } from "./review-spoiler-field";

afterEach(cleanup);

function renderRow(isSpoiler: boolean) {
  return render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <ReviewRow
        initials="AN"
        author="Ana"
        username={null}
        avatarUrl={null}
        dateLabel="1 ago 2026"
        rating={null}
        text="Al final el mayordomo lo hizo"
        isSpoiler={isSpoiler}
        knownUsernames={[]}
      />
    </NextIntlClientProvider>,
  );
}

describe("ReviewRow — reseña con spoiler", () => {
  it("sin marca, el texto se ve de entrada", () => {
    renderRow(false);
    expect(screen.getByText("Al final el mayordomo lo hizo")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mostrar spoiler" })).toBeNull();
  });

  it("marcada, el texto queda tapado hasta el clic", () => {
    renderRow(true);
    expect(screen.queryByText("Al final el mayordomo lo hizo")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mostrar spoiler" }));
    expect(screen.getByText("Al final el mayordomo lo hizo")).toBeTruthy();
  });
});

describe("ReviewSpoilerField", () => {
  function renderField(review: string) {
    return render(
      <NextIntlClientProvider locale="es" messages={messages}>
        <ReviewSpoilerField review={review} checked={false} onChange={() => {}} />
      </NextIntlClientProvider>,
    );
  }

  it("sin texto no ofrece la casilla", () => {
    renderField("   ");
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("con texto la casilla viaja como reviewIsSpoiler", () => {
    renderField("Qué final");
    const box = screen.getByRole("checkbox", { name: /Contiene spoiler/ }) as HTMLInputElement;
    expect(box.name).toBe("reviewIsSpoiler");
  });
});
