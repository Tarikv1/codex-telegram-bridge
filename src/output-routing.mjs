export function shouldForwardEvent(event, { forwardStatusUpdates = true } = {}) {
  if (event?.kind === "status" && !forwardStatusUpdates) return false;
  return true;
}

export function parseUpdatesArg(arg) {
  const value = String(arg || "").trim().toLowerCase();
  if (!value) return null;
  if (["on", "enable", "enabled", "yes", "true"].includes(value)) return true;
  if (["off", "disable", "disabled", "no", "false"].includes(value)) return false;
  throw new Error("Use /updates on or /updates off.");
}

export function formatUpdatesResponse(enabled, { changed = false } = {}) {
  const state = enabled ? "enabled" : "disabled";
  const prefix = changed ? "Status updates changed" : "Status updates";
  return `${prefix}: ${state}.\nFinal assistant answers are still forwarded.`;
}
