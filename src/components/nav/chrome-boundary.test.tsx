// @vitest-environment jsdom
import { act, fireEvent, waitFor } from "@testing-library/react";
import { useEffect, useState, useSyncExternalStore, startTransition, type ReactNode } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setupPathname = "/partidas/mtg/nueva";
const pathnameCommits: string[] = [];

function makePathnameStore(pathname = setupPathname) {
  const subscribers = new Set<() => void>();
  return {
    pathname,
    read() { return this.pathname; },
    subscribe(callback: () => void) {
      subscribers.add(callback);
      return () => { subscribers.delete(callback); };
    },
    navigate(destination: string) {
      this.pathname = destination;
      subscribers.forEach((callback) => callback());
    },
  };
}

let route = makePathnameStore();

function makeHold() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { pending: false, promise, release() { this.pending = false; release(); } };
}

let session = makeHold();
let pathnameHold = makeHold();
let sessionReads = 0;

// Next's pathname context and the delivered RSC/session payload are controlled
// seams. React DOM SSR, selective hydration, ChromeGate and both bars are real.
vi.mock("next/navigation", () => ({
  usePathname: () => {
    // A delayed boundary reads the current pathname, rather than a server
    // pathname frozen for this test. A committed gate subscribes to changes.
    const pathname = useSyncExternalStore(route.subscribe, () => route.read(), () => route.read());
    useEffect(() => { pathnameCommits.push(pathname); }, [pathname]);
    if (pathnameHold.pending) throw pathnameHold.promise;
    return pathname;
  },
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/components/social/notification-bell", () => ({ NotificationBell: () => null }));

import { Header } from "../header";
import { BottomNav } from "./bottom-nav";
import { ChromeBoundary } from "./chrome-boundary";

function SessionPayload({ children }: { children: ReactNode }) {
  sessionReads += 1;
  if (session.pending) throw session.promise;
  return children;
}

function InteractiveMain({ navigate }: { navigate: () => void }) {
  const [barrier, setBarrier] = useState(0);
  return (
    <main>
      <button onClick={() => setBarrier((value) => value + 1)}>Barrera</button>
      <output>{barrier}</output>
      <button onClick={navigate}>Empezar</button>
    </main>
  );
}

function Fixture({
  header,
  destination = "/partida/activa",
  companion = null,
}: {
  header: ReactNode;
  destination?: string;
  companion?: ReactNode;
}) {
  return (
    <>
      <ChromeBoundary fallback={<div data-fallback="header" />}>
        <SessionPayload>{header}</SessionPayload>
      </ChromeBoundary>
      <InteractiveMain navigate={() => startTransition(() => route.navigate(destination))} />
      <ChromeBoundary fallback={<div data-fallback="nav" />}>
        <SessionPayload><BottomNav username={null} /></SessionPayload>
      </ChromeBoundary>
      <ChromeBoundary fallback={null}>
        <SessionPayload>{companion}</SessionPayload>
      </ChromeBoundary>
    </>
  );
}

let root: Root | undefined;
let container: HTMLDivElement;
let consoleErrors: ReturnType<typeof vi.spyOn>;
let recoverableErrors: unknown[];

beforeEach(() => {
  route = makePathnameStore();
  session = makeHold();
  pathnameHold = makeHold();
  sessionReads = 0;
  pathnameCommits.length = 0;
  recoverableErrors = [];
  consoleErrors = vi.spyOn(console, "error"); // Observe; do not suppress warnings.
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(async () => {
  await act(async () => {
    session.release();
    pathnameHold.release();
    root?.unmount();
  });
  root = undefined;
  container.remove();
  consoleErrors.mockRestore();
});

async function fixture(props: Omit<Parameters<typeof Fixture>[0], "header"> = {}) {
  const header = await Header({ loggedIn: false, username: null, avatarUrl: null, unreadCount: 0 });
  return <Fixture {...props} header={header} />;
}

async function hydrate(tree: ReactNode) {
  await act(async () => {
    root = hydrateRoot(container, tree, {
      onRecoverableError: (error) => recoverableErrors.push(error),
    });
  });
  // A live handler outside the chrome proves the root has committed while the
  // controlled session/pathname read is still held. No timer-based race.
  await act(async () => {
    fireEvent.click(container.querySelector("main button")!);
  });
  await waitFor(() => expect(container.querySelector("output")?.textContent).toBe("1"));
}

function expectNoRecovery() {
  expect(recoverableErrors).toEqual([]);
  expect(consoleErrors).not.toHaveBeenCalled();
}

describe("chrome boundaries during selective hydration (#1385)", () => {
  it.each(["/partida/activa", "/mascota"])("removes server bars on %s before the session is delivered", async (destination) => {
    const tree = await fixture({ destination });
    container.innerHTML = renderToString(tree);
    const header = container.querySelector("header");
    const nav = container.querySelector("nav.sticky.bottom-0");
    expect(header).not.toBeNull();
    expect(nav).not.toBeNull();

    session.pending = true;
    await hydrate(tree);
    expect(session.pending).toBe(true);
    expect(sessionReads).toBeGreaterThan(0);
    expect(container.querySelector("header")).toBe(header);
    expect(container.querySelector("nav.sticky.bottom-0")).toBe(nav);
    const gateCommitsBeforeNavigation = pathnameCommits.slice();

    await act(async () => {
      fireEvent.click(container.querySelectorAll("main button")[1]);
    });
    expect(session.pending).toBe(true);
    const barsBeforeSessionRelease = [
      container.querySelector("header"),
      container.querySelector("nav.sticky.bottom-0"),
    ];
    await act(async () => { session.release(); });

    expectNoRecovery();
    expect(gateCommitsBeforeNavigation).toEqual([setupPathname, setupPathname, setupPathname]);
    expect(barsBeforeSessionRelease).toEqual([null, null]);
    expect(container.querySelector("header")).toBeNull();
    expect(container.querySelector("nav.sticky.bottom-0")).toBeNull();
    expect(container.querySelector("[data-fallback]")).toBeNull();
  });

  it("keeps the server bars on a normal route while the session is held", async () => {
    const tree = await fixture();
    container.innerHTML = renderToString(tree);
    const header = container.querySelector("header");
    const nav = container.querySelector("nav.sticky.bottom-0");
    session.pending = true;
    await hydrate(tree);
    expect(container.querySelector("header")).toBe(header);
    expect(container.querySelector("nav.sticky.bottom-0")).toBe(nav);
    await act(async () => { session.release(); });
    expectNoRecovery();
    expect(container.querySelector("header")).toBe(header);
    expect(container.querySelector("nav.sticky.bottom-0")).toBe(nav);
  });

  it("can suspend pathname without blocking the interactive main", async () => {
    const tree = await fixture();
    container.innerHTML = renderToString(tree);
    pathnameHold.pending = true;
    await hydrate(tree);
    expect(pathnameHold.pending).toBe(true);
    expect(pathnameCommits).toEqual([]);
    await act(async () => { pathnameHold.release(); });
    expectNoRecovery();
    expect(container.querySelector("header")).not.toBeNull();
    expect(container.querySelector("nav.sticky.bottom-0")).not.toBeNull();
  });

  it("gates all three pieces without reading the session on a fullscreen route", async () => {
    route = makePathnameStore("/mascota");
    const tree = await fixture({ companion: <aside>Compañera</aside> });
    session.pending = true;
    container.innerHTML = renderToString(tree);
    await hydrate(tree);
    expect(sessionReads).toBe(0);
    expectNoRecovery();
    expect(container.querySelector("header, nav, aside, [data-fallback]")).toBeNull();
  });
});
