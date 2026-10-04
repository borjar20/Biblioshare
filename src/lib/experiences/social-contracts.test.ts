import { describe, expect, it } from "vitest";
import { NOTIFICATION_CATEGORY } from "@/lib/push/types";
import { notificationCopy } from "@/lib/social/notification-copy";
import type { NotificationType } from "@/lib/social/notification-types";

describe("experience notification contracts", () => {
  it.each([
    ["experience_invited", "experienceInvited"],
    ["experience_accepted", "experienceAccepted"],
    ["followed_experience", "followedExperience"],
    ["experience_reviewed", "experienceReviewed"],
  ])("keeps %s in the social preference with its own copy", (type, key) => {
    expect(NOTIFICATION_CATEGORY[type as NotificationType]).toBe("social");
    expect(notificationCopy({ type: type as NotificationType, name: "Ana" })).toEqual({ key, values: { name: "Ana" } });
  });
});
