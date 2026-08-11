import { describe, it, expect } from "vitest";
import { NOTIFY_CATEGORIES, CATEGORY_NOTIFICATION_TYPE, parseNotifyCategories } from "./notify-categories";
import { NOTIFICATION_TYPE_KEY } from "./notification-types";

describe("notify-categories", () => {
  it("cada categoría mapea a un tipo de notificación con clave i18n", () => {
    for (const c of NOTIFY_CATEGORIES) {
      const type = CATEGORY_NOTIFICATION_TYPE[c];
      expect(type).toMatch(/^followed_/);
      expect(NOTIFICATION_TYPE_KEY[type]).toBeTruthy();
    }
  });
  it("parseNotifyCategories descarta lo desconocido y deduplica", () => {
    expect(parseNotifyCategories(["finished","added","finished","xx",1,null]).sort())
      .toEqual(["added","finished"]);
    expect(parseNotifyCategories("finished")).toEqual([]);
    expect(parseNotifyCategories(undefined)).toEqual([]);
  });
});
