import crypto from "node:crypto";

export function parseRolloutLine(line) {
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    return null;
  }

  const payload = entry?.payload;
  if (!payload || typeof payload !== "object") return null;

  if (entry.type === "event_msg" && payload.type === "agent_message") {
    const text = normalizeText(payload.message);
    const kind = payload.phase === "final_answer" ? "assistant" : "status";
    return text ? { timestamp: entry.timestamp, kind, text } : null;
  }

  if (entry.type === "response_item" && payload.type === "message" && payload.role === "assistant") {
    const parts = Array.isArray(payload.content)
      ? payload.content
          .filter((item) => item?.type === "output_text" && typeof item.text === "string")
          .map((item) => item.text)
      : [];
    const text = normalizeText(parts.join("\n"));
    return text ? { timestamp: entry.timestamp, kind: "assistant", text } : null;
  }

  return null;
}

export function shouldForwardEvent(event) {
  return Boolean(event?.text && (event.kind === "status" || event.kind === "assistant"));
}

export function createDeduper({ windowMs = 5000, maxEntries = 1000 } = {}) {
  const seen = new Map();

  return {
    shouldSend(threadId, event) {
      const at = Date.parse(event.timestamp || "") || Date.now();
      const key = `${threadId}:${hashText(event.text)}`;
      const previous = seen.get(key);

      for (const [existingKey, existingAt] of seen) {
        if (at - existingAt > windowMs) seen.delete(existingKey);
      }
      while (seen.size > maxEntries) {
        const first = seen.keys().next().value;
        seen.delete(first);
      }

      if (previous && at - previous <= windowMs) return false;
      seen.set(key, at);
      return true;
    }
  };
}

export function hashText(text) {
  return crypto.createHash("sha256").update(String(text)).digest("hex").slice(0, 16);
}

function normalizeText(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n/g, "\n").trim();
}
