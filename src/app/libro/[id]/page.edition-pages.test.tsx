// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/es.json";
import { PAGE_BOOK, PAGE_CASES, PAGE_PASS, PAGE_USER, pageFixture } from "@/lib/editions/edition-pages.test-fixture";

const boundary = vi.hoisted(() => ({ createClient: vi.fn(), createPublicClient: vi.fn(), getCurrentUser: vi.fn(), getAccessToken: vi.fn() }));
vi.mock("@/lib/supabase/server", () => boundary);
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("Unexpected notFound in page fixture"); },
  usePathname: () => "/libro/page-fixture-book",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("next/server", () => ({ after: () => { throw new Error("Unexpected background work in #901"); } }));
vi.mock("next-intl/server", () => ({ getTranslations: async (namespace: Parameters<typeof createTranslator<typeof messages>>[0]["namespace"]) => createTranslator({ locale: "es", messages, namespace }) }));
vi.mock("@/lib/auth/roles", () => ({ getCurrentUserRole: async () => "user", hasMinRole: () => false }));
vi.mock("@/lib/community/get-community", () => ({ getRatingSummary: async () => ({ avgRating: null, ratingCount: 0 }), getReviews: vi.fn() }));
vi.mock("@/lib/social/joint-viewings", () => ({ getPendingJointInvites: async () => [] }));
vi.mock("@/lib/notes/get-notes", () => ({ getNotesForItem: async () => [] }));
vi.mock("@/lib/catalog/hydrate-book", () => ({ ensureBookHydrated: vi.fn(), needsGoogleVolumeHydrationRetry: () => false }));
vi.mock("@/lib/people/enrich-item", () => ({ ensureItemEnriched: vi.fn() }));
vi.mock("@/lib/people/get-item-credits", () => ({ getItemCredits: vi.fn() }));
vi.mock("@/lib/sagas/get-item-sagas", () => ({ getItemSagas: vi.fn() }));
vi.mock("@/lib/sagas/get-saga", () => ({ getSaga: vi.fn() }));
vi.mock("@/lib/reactivity/revalidate", () => ({ expireItemCredits: vi.fn() }));
vi.mock("@/lib/library/add-existing-item", () => ({ addExistingItemToLibrary: vi.fn() }));
// The real public route and its private async detail function calculate the
// rail. Only the shell and unrelated tabs/leaves are replaced; PassCard,
// getEditions, pagesForPass and passPercent stay real.
vi.mock("@/components/detail/item-shell", () => ({ ItemShell: ({ passCard }: { passCard: ReactNode }) => <section aria-label="Pase del libro">{passCard}</section> }));
vi.mock("@/components/route-messages", () => ({ RouteMessages: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/detail/item-shell-skeleton", () => ({ ItemShellSkeleton: () => null }));
vi.mock("@/components/detail/item-tabs-skeleton", () => ({ ItemTabsSkeleton: () => null }));
vi.mock("@/components/social/pending-joint-invites", () => ({ PendingJointInvites: () => null }));
vi.mock("@/components/detail/sticky-pass-cta", () => ({ StickyPassCta: () => null }));
vi.mock("@/components/detail/log-panel", () => ({ LogPanel: () => null }));
vi.mock("@/components/detail/hero-menu", () => ({ HeroMenu: () => null }));
vi.mock("@/components/detail/catalog-editor", () => ({ CatalogEditor: () => null, EditFichaButton: () => null }));
vi.mock("@/components/detail/item-detail-tabs", () => ({ ItemDetailTabs: () => null }));
vi.mock("@/components/detail/info-panel", () => ({ InfoPanel: () => null }));
vi.mock("@/components/detail/info-layout", () => ({ InfoLayout: () => null }));
vi.mock("@/components/detail/metadata-sidebar", () => ({ MetadataSidebar: () => null }));
vi.mock("@/components/detail/community-panel", () => ({ CommunityPanel: () => null }));
vi.mock("@/components/detail/saga-strip", () => ({ SagaStrip: () => null }));
vi.mock("@/components/detail/edition-details", () => ({ EditionsSection: () => null }));
vi.mock("@/components/detail/editions-loading", () => ({ EditionsLoading: () => null }));
vi.mock("@/components/detail/hydration-watch", () => ({ HydrationWatch: () => null }));
vi.mock("@/components/detail/saga-list", () => ({ SagaList: () => null }));
vi.mock("@/components/notes/notes-section", () => ({ NotesSection: () => null }));
import BookDetailPage from "@/app/libro/[id]/page";

type RouteProps = Parameters<typeof BookDetailPage>[0];
type AsyncDetail = (props: RouteProps) => Promise<ReactElement>;

// Vitest cannot render async RSCs. This is a composition/consumer contract:
// enter through the public synchronous page, resolve its async detail child,
// then render the synchronous real PassCard with the computed progress.
async function resolveDetail() {
  const route = BookDetailPage({ params: Promise.resolve({ id: PAGE_BOOK }), searchParams: Promise.resolve({}) });
  const messagesBoundary = route.props.children;
  expect(isValidElement(messagesBoundary)).toBe(true);
  const child = (messagesBoundary as ReactElement<{ children: ReactElement<RouteProps> }>).props.children;
  expect(isValidElement(child)).toBe(true);
  expect(typeof child.type).toBe("function");
  return (child.type as AsyncDetail)(child.props);
}

beforeEach(() => {
  vi.clearAllMocks();
  boundary.getCurrentUser.mockResolvedValue({ id: PAGE_USER });
  boundary.getAccessToken.mockResolvedValue(null);
  vi.stubGlobal("fetch", () => { throw new Error("Real fetch forbidden in #901"); });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("la ficha aplica la precedencia al rail de progreso (#901)", () => {
  it.each(PAGE_CASES)("$name", async (sample) => {
    const { client } = pageFixture(sample);
    boundary.createClient.mockResolvedValue(client);
    boundary.createPublicClient.mockReturnValue(client);
    const detail = await resolveDetail();
    render(<NextIntlClientProvider locale="es" messages={messages}>{detail}</NextIntlClientProvider>);
    expect(screen.getByRole("link", { name: "Registrar sesión" }).getAttribute("href")).toBe(`/sesion/${PAGE_PASS}`);
    if (sample.expectedPages === null) expect(screen.queryByRole("progressbar")).toBeNull();
    else {
      const progress = screen.queryByRole("progressbar", { name: `pág. 100 / ${sample.expectedPages}` });
      expect(progress).not.toBeNull();
      expect(progress!.getAttribute("aria-valuenow")).toBe(String(sample.expectedPercent));
      expect(screen.getByText(`${sample.expectedPercent}%`)).toBeTruthy();
    }
  });
});
