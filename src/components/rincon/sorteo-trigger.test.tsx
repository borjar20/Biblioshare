// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./sorteo-stage", () => ({
  SorteoStage: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? <div role="dialog"><button type="button" onClick={onClose}>cerrar</button></div> : null,
}));
import { SorteoTrigger } from "./sorteo-trigger";

afterEach(cleanup);

describe("SorteoTrigger", () => {
  it("abre la partida al pulsar y la cierra desde ella", async () => {
    render(<SorteoTrigger ariaLabel="Abrir">¿Cuál toca?</SorteoTrigger>);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "cerrar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
