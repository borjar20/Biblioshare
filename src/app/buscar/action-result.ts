export type SearchRateLimitReason = "catalogRequest" | "googleBooksCreate";

export type SearchActionRateLimit = {
  ok: false;
  error: "RATE_LIMIT";
  reason: SearchRateLimitReason;
};
