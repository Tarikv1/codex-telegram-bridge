import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export function buildCodexExecResumeArgs({ threadId, json = true }) {
  const id = String(threadId || "").trim();
  if (!id) throw new Error("Cannot send Codex CLI input without a bound thread id.");

  return [
    "exec",
    "resume",
    ...(json ? ["--json"] : []),
    "--skip-git-repo-check",
    id,
    "-"
  ];
}

export async function sendInputWithCodexExec(
  text,
  {
    threadId,
    codexCommand = "codex",
    cwd = process.cwd(),
    dryRun = false,
    errorLogPath = defaultCodexExecErrorLogPath()
  } = {}
) {
  if (dryRun) return { ok: true, dryRun: true, inputMode: "codex-exec" };

  const launch = buildCodexExecSpawnPlan({ threadId, codexCommand });
  const child = spawn(launch.command, launch.args, {
    cwd,
    ...launch.options
  });

  return new Promise((resolve, reject) => {
    let stderr = "";
    let settled = false;
    let earlyExitTimer = null;

    child.stderr?.on("data", (chunk) => {
      stderr = `${stderr}${chunk.toString("utf8")}`.slice(-4000);
    });

    child.once("error", reject);
    child.once("spawn", () => {
      child.stdin.end(String(text));
      earlyExitTimer = setTimeout(() => {
        settled = true;
        child.stderr?.unref?.();
        child.unref();
        resolve({ ok: true, inputMode: "codex-exec", processId: child.pid });
      }, 1500);
    });

    child.once("exit", async (code, signal) => {
      if (earlyExitTimer) clearTimeout(earlyExitTimer);
      await writeCodexExecExitLog({ errorLogPath, code, signal, stderr }).catch(() => {});
      if (!settled && code !== 0) {
        settled = true;
        reject(new Error(formatCodexExecFailure({ code, signal, stderr })));
      } else if (!settled) {
        settled = true;
        resolve({ ok: true, inputMode: "codex-exec", processId: child.pid, exited: true, exitCode: code });
      }
    });
  });
}

export function buildCodexExecSpawnPlan({
  threadId,
  codexCommand = "codex",
  codexJsPath = defaultCodexJsPath(),
  platform = process.platform
}) {
  const args = buildCodexExecResumeArgs({ threadId });
  const options = {
    detached: false,
    stdio: ["pipe", "ignore", "pipe"],
    windowsHide: true
  };

  if (platform === "win32" && codexCommand === "codex" && codexJsPath) {
    return { command: "node.exe", args: [codexJsPath, ...args], options };
  }

  if (platform === "win32") {
    const command = codexCommand === "codex" ? "codex.cmd" : codexCommand;
    return { command: "cmd.exe", args: ["/d", "/s", "/c", command, ...args], options };
  }
  return { command: codexCommand, args, options };
}

function defaultCodexJsPath() {
  const appData = process.env.APPDATA;
  if (!appData) return null;
  const candidate = path.join(appData, "npm", "node_modules", "@openai", "codex", "bin", "codex.js");
  return existsSync(candidate) ? candidate : null;
}

function defaultCodexExecErrorLogPath() {
  return path.join(os.homedir(), ".codex", "telegram-bridge.codex-exec-errors.log");
}

async function writeCodexExecExitLog({ errorLogPath, code, signal, stderr }) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    code,
    signal,
    stderr: String(stderr || "").slice(-2000)
  });
  await appendFile(errorLogPath, `${line}\n`, "utf8");
}

function formatCodexExecFailure({ code, signal, stderr }) {
  const suffix = stderr?.trim() ? `: ${stderr.trim().split(/\r?\n/).slice(-3).join(" ")}` : "";
  return `Codex CLI input failed with exit code ${code}${signal ? ` signal ${signal}` : ""}${suffix}`;
}
