export function formatPingResponse({ boundThread = null, inputMode = "unknown", paused = false } = {}) {
  const bound = boundThread
    ? `${boundThread.title || "Untitled Codex thread"} (${boundThread.id || "unknown id"})`
    : "none";
  return [
    "Bridge pong.",
    `State: ${paused ? "paused" : "active"}`,
    `Input mode: ${inputMode}`,
    `Bound thread: ${bound}`
  ].join("\n");
}
