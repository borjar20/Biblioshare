import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PublicProfilePage from "./page";

const mocks = vi.hoisted(() => ({ user: { id: "owner" } as { id: string } | null, redirect: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (href: string) => { mocks.redirect(href); throw new Error("redirect"); },
  notFound: () => { throw new Error("notFound"); },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}), getCurrentUser: async () => mocks.user }));
vi.mock("@/lib/profile/get-profile-by-username", () => ({
  getProfileByUsername: async () => ({ userId: "owner", username: "mar", isPublic: true, hideDropped: false }),
  getProfileIdentity: vi.fn(),
}));
vi.mock("@/lib/social/follows", () => ({
  getFollowCounts: async () => ({}), getFollowNotify: async () => [],
  getFollowState: async () => "none", getPendingRequests: async () => [],
}));
vi.mock("@/lib/social/block-state", () => ({ getBlockState: async () => "none" }));
vi.mock("@/lib/library/get-library-stats", () => ({ getLibraryStats: async () => ({}) }));
vi.mock("@/components/profile-header", () => ({ ProfileHeader: () => null }));
vi.mock("@/components/section-tabs", () => ({ SectionTabs: () => null }));
vi.mock("@/components/social/follow-button", () => ({ FollowButton: () => null }));
vi.mock("@/components/social/notify-bell", () => ({ NotifyBell: () => null }));
vi.mock("@/components/social/profile-safety-actions", () => ({ ProfileSafetyActions: () => null }));
vi.mock("@/components/social/follow-requests", () => ({ FollowRequests: () => null }));
vi.mock("@/components/social/private-profile-stub", () => ({ PrivateProfileStub: () => null }));
vi.mock("@/components/nav/you-row", () => ({ YouRow: () => null }));
vi.mock("./_tabs/activity-tab", () => ({ ActivityTab: () => null }));
vi.mock("./_tabs/collection-tab", () => ({ CollectionTab: () => null }));
vi.mock("./_tabs/stats-tab", () => ({ StatsTab: () => null }));
vi.mock("./_tabs/rincon-tab", () => ({ RinconTab: () => null }));
vi.mock("./_tabs/experiences-tab", () => ({ ExperiencesTab: () => null }));

async function profileContent(params: Record<string, string> = {}) {
  const shell = PublicProfilePage({ params: Promise.resolve({ username: "mar" }), searchParams: Promise.resolve(params) });
  const content = shell.props.children as ReactElement<Record<string, unknown>>;
  return (content.type as (props: typeof content.props) => Promise<ReactElement>)(content.props);
}

function findElement(root: unknown, name: string): ReactElement | undefined {
  if (!isValidElement<{ children?: unknown }>(root)) return undefined;
  if (typeof root.type === "function" && root.type.name === name) return root;
  const children = Array.isArray(root.props.children) ? root.props.children : [root.props.children];
  return children.map((child) => findElement(child, name)).find(Boolean);
}

beforeEach(() => { mocks.user = { id: "owner" }; vi.clearAllMocks(); });
describe("alias privados del perfil", () => {
  it.each(["panel", "estadisticas"])("%s del dueño abre Estadísticas conservando sus filtros", async (tab) => {
    await expect(profileContent({ tab, periodo: "mes", tipo: "movie", medida: "works", archivados: "1" })).rejects.toThrow("redirect");
    expect(mocks.redirect).toHaveBeenCalledWith("/estadisticas?periodo=mes&tipo=movie&medida=works");
  });

  it("Rincón del dueño conserva el acceso a retos archivados en Biblioteca", async () => {
    await expect(profileContent({ tab: "rincon", archivados: "1" })).rejects.toThrow("redirect");
    expect(mocks.redirect).toHaveBeenCalledWith("/coleccion/rincon?archivados=1");
  });

  it.each(["panel", "estadisticas", "rincon"])("un visitante no se desvía a herramientas propias con tab=%s", async (tab) => {
    mocks.user = { id: "visitor" };
    const result = await profileContent({ tab, archivados: "1" });
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(findElement(result, "ActivityTab")).toBeDefined();
    expect(findElement(result, "RinconTab")).toBeUndefined();
    expect(findElement(result, "StatsTab")).toBeUndefined();
  });

  it("el perfil propio no pinta la fila de herramientas", async () => {
    expect(findElement(await profileContent(), "YouRow")).toBeUndefined();
  });
});

describe("contexto de quien mira las Experiencias del perfil", () => {
  it.each(["owner", "visitor", null])("pasa %s a la pestaña sin sustituirlo por el dueño del perfil", async (viewerId) => {
    mocks.user = viewerId === null ? null : { id: viewerId };
    const tab = findElement(await profileContent({ tab: "experiencias" }), "ExperiencesTab");

    expect(tab).toBeDefined();
    expect(tab!.props).toMatchObject({ userId: "owner", viewerId });
  });
});
