const DESKTOP_ALIASES = new Set(["desktop-ui", "desktop", "ui", "window", "visible"]);
const EXEC_ALIASES = new Set(["codex-exec", "exec", "cli", "headless"]);

export function normalizeInputMode(value) {
  const text = String(value || "").trim().toLowerCase();
  if (EXEC_ALIASES.has(text)) return "codex-exec";
  if (DESKTOP_ALIASES.has(text)) return "desktop-ui";
  return "desktop-ui";
}

export function parseInputModeArg(value) {
  const text = String(value || "").trim().toLowerCase();
  if (DESKTOP_ALIASES.has(text)) return "desktop-ui";
  if (EXEC_ALIASES.has(text)) return "codex-exec";
  throw new Error(`Unknown input mode: ${value}. Use /mode desktop-ui or /mode codex-exec.`);
}

export function formatInputModeResponse(mode, { changed = false } = {}) {
  const normalized = normalizeInputMode(mode);
  const prefix = changed ? `Input mode set to ${normalized}.` : `Input mode: ${normalized}.`;
  const detail = normalized === "desktop-ui"
    ? "Telegram text will be pasted into the visible Codex desktop window so the desktop thread can show the turn. Keep the target chat open when sending input."
    : "Telegram text will run through codex exec resume for the bound thread. Replies can reach Telegram even when they may not appear in the desktop window.";
  return `${prefix}\n${detail}\n\nUse /mode desktop-ui or /mode codex-exec.`;
}
