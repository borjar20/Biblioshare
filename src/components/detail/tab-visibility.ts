export type DetailTabId = "info" | "log";

export function detailTabOrder(followed: boolean, inlineLog: boolean): DetailTabId[] {
  return followed && !inlineLog ? ["info", "log"] : ["info"];
}

export function clampDetailTab(requested: string | null, order: DetailTabId[]): DetailTabId {
  return requested === "log" && order.includes("log") ? "log" : "info";
}
