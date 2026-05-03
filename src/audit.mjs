import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

export class AuditLog {
  constructor({ logPath }) {
    this.logPath = logPath;
  }

  async write(type, detail = {}) {
    if (!this.logPath) return;
    await mkdir(path.dirname(this.logPath), { recursive: true });
    const sanitized = sanitize(detail);
    await appendFile(this.logPath, `${JSON.stringify({ ts: new Date().toISOString(), type, detail: sanitized })}\n`, "utf8");
  }
}

function sanitize(value) {
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.length > 240 ? `${value.slice(0, 240)}...` : value;
  if (Array.isArray(value)) return value.map(sanitize);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !/token|secret|credential|password/i.test(key))
        .map(([key, item]) => [key, sanitize(item)])
    );
  }
  return String(value);
}
