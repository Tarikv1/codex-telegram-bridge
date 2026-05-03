import { execFile } from "node:child_process";
import { promisify } from "node:util";

const runFile = promisify(execFile);
const THREAD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function buildCodexThreadUrl(threadId) {
  const value = String(threadId || "").trim();
  if (!THREAD_ID_PATTERN.test(value)) throw new Error(`Invalid Codex thread id: ${value}`);
  return `codex://threads/${value}`;
}

export async function openCodexThread(threadId, { dryRun = false } = {}) {
  const url = buildCodexThreadUrl(threadId);
  if (dryRun) return { ok: true, dryRun: true, url };
  if (process.platform !== "win32") throw new Error("Codex thread deep-link opening is only implemented for Windows.");
  await runFile("powershell.exe", buildOpenUrlPowerShellArgs(url), { maxBuffer: 1024 * 1024 });
  return { ok: true, url };
}

export function buildOpenUrlPowerShellArgs(url) {
  const script = String.raw`
$Url = '${quotePowerShellString(url)}'
Start-Process -FilePath $Url
`;
  return ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script];
}

function quotePowerShellString(value) {
  return String(value).replace(/'/g, "''");
}
