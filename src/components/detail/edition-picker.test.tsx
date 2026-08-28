// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import { EditionPicker } from "./edition-picker";

// `next/link` fuera del App Router no tiene router al que hablarle; aquí solo
// interesa que el CTA de escanear exista, no que navegue.
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const h = vi.hoisted(() => ({
  fetchEditionCandidates: vi.fn(),
  chooseEditionCandidate: vi.fn(),
}));

vi.mock("@/lib/editions/fetch-candidates", () => ({
  fetchEditionCandidates: h.fetchEditionCandidates,
  chooseEditionCandidate: h.chooseEditionCandidate,
}));
vi.mock("@/lib/editions/actions", () => ({ createEdition: vi.fn(async () => ({})) }));

// Sin `globals: true` la limpieza de testing-library no se registra sola y los
// renders se acumulan en el mismo body.
afterEach(cleanup);

beforeEach(() => {
  h.fetchEditionCandidates.mockReset();
  h.chooseEditionCandidate.mockReset();
});

// Los textos salen de `messages/es.json` DE VERDAD: si una clave nueva no está
// ahí, next-intl lo canta aquí en vez de en producción.
function renderPicker() {
  return render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <EditionPicker
        itemType="book"
        itemId="book-1"
        editions={[]}
        passes={[]}
        title="¿Qué edición estás leyendo?"
        passId="pass-1"
        onPick={() => {}}
      />
    </NextIntlClientProvider>,
  );
}

function openMoreEditions(container: HTMLElement): HTMLDetailsElement {
  const details = container.querySelector("details") as HTMLDetailsElement;
  const summary = details.querySelector("summary") as HTMLElement;
  fireEvent.click(summary);
  // jsdom no siempre implementa el toggle nativo del `<details>`: se fuerza el
  // estado y se dispara el evento que la UI escucha.
  if (!details.open) {
    details.open = true;
    fireEvent(details, new Event("toggle", { bubbles: false }));
  }
  return details;
}

describe("chevron de «Más ediciones»", () => {
  // `group-open:` mira el `[open]` del elemento que lleva `.group`, y `open`
  // solo lo tiene el `<details>`. Con `group` en el `<summary>` el chevron no
  // giraba nunca — mismo patrón que log-panel y list-challenge-board.
  it("la clase `group` va en el <details>, no en el <summary>", () => {
    h.fetchEditionCandidates.mockResolvedValue([]);
    const { container } = renderPicker();

    const details = container.querySelector("details") as HTMLDetailsElement;
    const summary = details.querySelector("summary") as HTMLElement;

    expect(details.className.split(/\s+/)).toContain("group");
    expect(summary.className.split(/\s+/)).not.toContain("group");
    // Y hay un `group-open:` que dependa de ello: sin esto la aserción de
    // arriba pasaría aunque el chevron ya no girase por otro motivo.
    expect(details.innerHTML).toContain("group-open:rotate-0");
  });
});

describe("fallo al CARGAR las candidatas", () => {
  it("dice que no se pudieron cargar, no que no se pudo guardar", async () => {
    h.fetchEditionCandidates.mockRejectedValue(new Error("red caída"));
    const { container } = renderPicker();
    openMoreEditions(container);

    await waitFor(() => {
      expect(
        screen.getByText(/No se pudieron cargar las ediciones de OpenLibrary/i),
      ).toBeTruthy();
    });
    // El mensaje de guardar afirmaría algo que no ha pasado: nunca se intentó.
    expect(screen.queryByText("No se pudo guardar la edición.")).toBeNull();
    expect(h.chooseEditionCandidate).not.toHaveBeenCalled();
  });

  it("no afirma a la vez que no hay ediciones (la rama de fallo deja la lista en [])", async () => {
    h.fetchEditionCandidates.mockRejectedValue(new Error("red caída"));
    const { container } = renderPicker();
    openMoreEditions(container);

    await waitFor(() => {
      expect(
        screen.getByText(/No se pudieron cargar las ediciones de OpenLibrary/i),
      ).toBeTruthy();
    });
    expect(screen.queryByText(/No hay más ediciones que ofrecerte/i)).toBeNull();
  });

  it("control: cuando la carga SÍ va y no hay nada, el vacío se afirma", async () => {
    h.fetchEditionCandidates.mockResolvedValue([]);
    const { container } = renderPicker();
    openMoreEditions(container);

    await waitFor(() => {
      expect(screen.getByText(/No hay más ediciones que ofrecerte/i)).toBeTruthy();
    });
    expect(
      screen.queryByText(/No se pudieron cargar las ediciones de OpenLibrary/i),
    ).toBeNull();
  });
});

describe("elegir una candidata", () => {
  const candidate = {
    isbn: "9788433920423",
    label: "Bolsillo",
    publisher: "Anagrama",
    year: 2019,
    pages: 300,
    coverUrl: "https://covers.openlibrary.org/b/id/123-L.jpg",
    language: "ES",
  };

  // El cliente no puede aportar metadatos al catálogo comunitario: si le
  // mandara el objeto entero, su `publisher` y su `coverUrl` acabarían en
  // `book_editions` para toda la comunidad (I1).
  it("al servidor solo le viaja el ISBN, nunca el objeto candidata", async () => {
    h.fetchEditionCandidates.mockResolvedValue([candidate]);
    h.chooseEditionCandidate.mockResolvedValue({ ok: true });
    const { container } = renderPicker();
    openMoreEditions(container);

    await waitFor(() => expect(screen.getByText("Anagrama")).toBeTruthy());
    fireEvent.click(screen.getByText("Anagrama").closest("button") as HTMLElement);

    await waitFor(() => expect(h.chooseEditionCandidate).toHaveBeenCalled());
    expect(h.chooseEditionCandidate).toHaveBeenCalledWith(
      "pass-1",
      "book-1",
      candidate.isbn,
    );
    const args = h.chooseEditionCandidate.mock.calls[0];
    expect(args).toHaveLength(3);
    expect(args.some((arg) => typeof arg === "object")).toBe(false);
  });

  it("un fallo al guardar sí usa el mensaje de guardar", async () => {
    h.fetchEditionCandidates.mockResolvedValue([candidate]);
    h.chooseEditionCandidate.mockResolvedValue({ ok: false, reason: "registerFailed" });
    const { container } = renderPicker();
    openMoreEditions(container);

    await waitFor(() => expect(screen.getByText("Anagrama")).toBeTruthy());
    fireEvent.click(screen.getByText("Anagrama").closest("button") as HTMLElement);

    await waitFor(() =>
      expect(screen.getByText("No se pudo registrar la edición.")).toBeTruthy(),
    );
  });
});
