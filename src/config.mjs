import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { normalizeInputMode } from "./input-mode.mjs";

export function defaultConfigPath() {
  return path.join(os.homedir(), ".codex", "telegram-bridge.local.json");
}

export function defaultAuditPath() {
  return path.join(os.homedir(), ".codex", "telegram-bridge.audit.ndjson");
}

export async function loadConfig(configPath = defaultConfigPath()) {
  let parsed;
  try {
    parsed = JSON.parse(stripBom(await readFile(configPath, "utf8")));
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`Missing config file: ${configPath}. Create it from README.md before starting the bridge.`);
    }
    throw error;
  }

  return {
    configPath,
    botToken: parsed.botToken || "",
    allowedUserId: String(parsed.allowedUserId || ""),
    pollIntervalMs: Number(parsed.pollIntervalMs || 1500),
    dryRun: Boolean(parsed.dryRun),
    paused: Boolean(parsed.paused),
    boundThreadId: parsed.boundThreadId || null,
    telegramChatId: parsed.telegramChatId ? String(parsed.telegramChatId) : null,
    lastUpdateId: Number.isFinite(Number(parsed.lastUpdateId)) ? Number(parsed.lastUpdateId) : 0,
    auditPath: parsed.auditPath || defaultAuditPath(),
    codexWindowProcessName: parsed.codexWindowProcessName || "Codex",
    inputMode: normalizeInputMode(parsed.inputMode),
    codexCommand: parsed.codexCommand || "codex"
  };
}

export async function saveRuntimeConfig(config, patch) {
  const next = { ...config, ...patch };
  await mkdir(path.dirname(next.configPath), { recursive: true });
  const persisted = {
    botToken: next.botToken,
    allowedUserId: next.allowedUserId,
    pollIntervalMs: next.pollIntervalMs,
    dryRun: next.dryRun,
    paused: next.paused,
    boundThreadId: next.boundThreadId,
    telegramChatId: next.telegramChatId,
    lastUpdateId: next.lastUpdateId,
    auditPath: next.auditPath,
    codexWindowProcessName: next.codexWindowProcessName,
    inputMode: normalizeInputMode(next.inputMode),
    codexCommand: next.codexCommand || "codex"
  };
  await writeFile(next.configPath, `${JSON.stringify(persisted, null, 2)}\n`, "utf8");
  return next;
}

function stripBom(text) {
  return String(text).replace(/^\uFEFF/, "");
}
