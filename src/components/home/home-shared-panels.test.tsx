// @vitest-environment jsdom
import { cloneElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import messages from "../../../messages/es.json";
import { StatsRail } from "@/components/stats/stats-rail";
import { ThisWeekReleases } from "@/components/releases/this-week-releases";

vi.mock("server-only", () => ({}));
vi.mock("@/components/route-messages", () => ({ RouteMessages: ({ children }: { children: ReactNode }) => children }));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ refresh() {} }) }));
vi.mock("next-intl/server", () => ({ getTranslations: async (namespace: string) => createTranslator({ locale: "es", messages, namespace: namespace as never }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/social/actions", () => ({ followUser: vi.fn() }));
vi.mock("@/lib/profile/get-profile-by-username", () => ({ getOwnProfile: async () => ({ username: "test", dailyGoalMinutes: 20 }) }));
vi.mock("@/lib/challenges/annual-goals", () => ({ getAnnualGoals: async () => ({ book: null, movie: null, series: null }) }));
vi.mock("@/lib/stats/get-weekly-activity", () => ({ getWeeklyActivity: async () => Array.from({ length: 7 }, (_, i) => ({ date: `2026-10-0${i + 1}`, minutes: (i + 1) * 10, active: true })) }));
vi.mock("@/lib/stats/get-streaks", () => ({ getStreaks: async () => ({ current: 7, best: 7 }) }));
vi.mock("@/lib/stats/get-annual-completed", () => ({ getAnnualCompleted: async () => ({ total: 0, byType: { book: 0, movie: 0, series: 0 } }) }));
vi.mock("@/lib/social/get-who-to-follow", () => ({ getWhoToFollow: async () => [] }));
vi.mock("@/lib/releases/queries", () => ({ getPublicReleases: async () => Array.from({ length: 3 }, (_, i) => ({ workKey: `book:${i}`, releases: [{ id: `release-${i}`, work_key: `book:${i}`, title: `Historia ${i}`, cover_url: "https://covers.openlibrary.org/b/id/123-L.jpg", item_type: "book", modality: "book", language: "es", market: "ES", date_precision: "day", date_value: "2026-10-07", status: "published", checked_at: null, author: null, publisher: null, book_id: null, synopsis: "Una historia", source_url: "https://example.test", source_name: "Editorial" }] })) }));

// Materializa solo componentes async de servidor; los de cliente se renderizan
// normalmente con React SSR, conservando el provider y los slots de producción.
async function serverNodes(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map(serverNodes));
  if (!isValidElement<Record<string, ReactNode>>(node)) return node;
  if (typeof node.type === "function" && node.type.constructor.name === "AsyncFunction") {
    const resolved = await serverNodes(await (node.type as (props: unknown) => Promise<ReactNode>)(node.props));
    return isValidElement(resolved) && node.key != null ? cloneElement(resolved, { key: node.key }) : resolved;
  }
  const props = { ...node.props };
  for (const key of ["children", "focus", "summary", "sectionHeading"]) if (key in props) props[key] = await serverNodes(props[key]);
  return Array.isArray(props.children) ? cloneElement(node, props, ...props.children) : cloneElement(node, props);
}
async function markup(node: ReactNode) {
  const html = renderToStaticMarkup(<NextIntlClientProvider locale="es" messages={messages} timeZone="Europe/Madrid">{await serverNodes(node)}</NextIntlClientProvider>);
  const root = document.createElement("div"); root.innerHTML = html; return root;
}
it("Tu semana usa las mismas siete barras en resumen y gráfico completo", async () => {
  const root = await markup(await StatsRail({ userId: "test" }));
  expect(root.querySelectorAll('.home-mini-bars > span, div[title]')).toHaveLength(7);
});
it("Sale esta semana usa una sola portada por obra durante toda la transformación", async () => {
  const root = await markup(await ThisWeekReleases({ expandable: true }));
  expect(root.querySelectorAll("img")).toHaveLength(3);
  expect(root.querySelectorAll('[data-release-id]')).toHaveLength(3);
  expect(within(root).getAllByRole("region", { name: "Sale esta semana", hidden: true })).toHaveLength(1);
});
