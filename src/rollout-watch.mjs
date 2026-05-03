import { stat } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

export async function waitForFileGrowth(filePath, { fromSize, timeoutMs = 5000, intervalMs = 100 } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const info = await stat(filePath);
    if (info.size > fromSize) return { grew: true, size: info.size };
    await sleep(intervalMs);
  }
  throw new Error("Codex rollout file did not change after desktop input. The paste likely missed the composer or the message was not submitted.");
}
