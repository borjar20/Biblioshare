import { describe, expect, it } from "vitest";
import { POST_KINDS } from "./post-kinds";
import {
  NOTIFY_CATEGORIES,
  CATEGORY_FOR_POST_KIND,
  POST_KIND_NOTIFICATION_TYPE,
  parseNotifyCategories,
} from "./notify-categories";

describe("categorías de aviso por persona", () => {
  it("cada post.kind tiene tipo de notificación y categoría", () => {
    for (const kind of POST_KINDS) {
      expect(POST_KIND_NOTIFICATION_TYPE[kind]).toBeTruthy();
      expect(NOTIFY_CATEGORIES).toContain(CATEGORY_FOR_POST_KIND[kind]);
    }
  });

  it("los hitos van a milestone, el progreso a progress, el pensamiento a thought", () => {
    expect(CATEGORY_FOR_POST_KIND.started).toBe("milestone");
    expect(CATEGORY_FOR_POST_KIND.finished).toBe("milestone");
    expect(CATEGORY_FOR_POST_KIND.dropped).toBe("milestone");
    expect(CATEGORY_FOR_POST_KIND.progressed).toBe("progress");
    expect(CATEGORY_FOR_POST_KIND.watched).toBe("progress");
    expect(CATEGORY_FOR_POST_KIND.thought).toBe("thought");
  });

  it("reutiliza los tres tipos que ya existían", () => {
    expect(POST_KIND_NOTIFICATION_TYPE.finished).toBe("followed_finished");
    expect(POST_KIND_NOTIFICATION_TYPE.progressed).toBe("followed_session");
    expect(POST_KIND_NOTIFICATION_TYPE.watched).toBe("followed_episode");
  });

  it("cada post.kind tiene su PROPIO tipo — dos kinds nunca comparten texto", () => {
    const types = POST_KINDS.map((k) => POST_KIND_NOTIFICATION_TYPE[k]);
    expect(new Set(types).size).toBe(POST_KINDS.length);
  });

  it("parseNotifyCategories descarta las categorías del modelo viejo", () => {
    expect(parseNotifyCategories(["finished", "session", "episode", "added"])).toEqual([]);
  });

  it("parseNotifyCategories acepta las nuevas, deduplica y rechaza lo que no es array", () => {
    expect(parseNotifyCategories(["milestone", "milestone", "thought"])).toEqual([
      "milestone",
      "thought",
    ]);
    expect(parseNotifyCategories("milestone")).toEqual([]);
    expect(parseNotifyCategories(null)).toEqual([]);
  });
});
