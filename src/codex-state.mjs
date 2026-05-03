import { execFile } from "node:child_process";
import { access, readdir, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const runFile = promisify(execFile);
const REQUIRED_THREAD_COLUMNS = ["id", "title", "rollout_path", "source", "updated_at_ms", "archived", "cwd"];

export async function discoverCompatibleStateDatabase({ homeDir = os.homedir() } = {}) {
  const codexDir = path.join(homeDir, ".codex");
  const entries = await readdir(codexDir, { withFileTypes: true });
  const candidates = [];

  for (const entry of entries) {
    if (!entry.isFile() || !/^state_.*\.sqlite$/i.test(entry.name)) continue;
    const databasePath = path.join(codexDir, entry.name);
    const info = await stat(databasePath);
    candidates.push({ databasePath, mtimeMs: info.mtimeMs });
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);

  const failures = [];
  for (const candidate of candidates) {
    const validation = await inspectStateDatabase(candidate.databasePath).catch((error) => ({
      ok: false,
      error: error.message
    }));
    if (validation.ok) {
      return {
        databasePath: candidate.databasePath,
        requiredColumnsPresent: true,
        columns: validation.columns,
        checkedCandidates: candidates.map((item) => item.databasePath),
        skipped: failures
      };
    }
    failures.push({ databasePath: candidate.databasePath, reason: validation.error || validation.missing?.join(", ") });
  }

  throw new Error(`No compatible Codex state database found in ${codexDir}. Checked ${candidates.length} candidate(s).`);
}

export async function getCurrentThreadCandidate({ databasePath }) {
  const result = await runPythonJson(databasePath, "candidate");
  if (!result?.id) {
    throw new Error("No non-archived desktop Codex thread candidate found.");
  }
  return {
    id: result.id,
    title: result.title || "Untitled Codex thread",
    rolloutPath: normalizePathValue(result.rollout_path),
    source: result.source,
    cwd: normalizePathValue(result.cwd),
    updatedAtMs: result.updated_at_ms || 0
  };
}

export async function listDesktopThreads({ databasePath, query = "", limit = 10 } = {}) {
  const result = await runPythonJson(databasePath, "list", JSON.stringify({ query, limit }));
  return (result.threads || []).map(normalizeThreadRow);
}

export function resolveThreadSelector({ selector, threads }) {
  const value = String(selector || "").trim();
  if (!value) throw new Error("Missing thread selector.");

  const index = Number(value);
  if (Number.isInteger(index) && index >= 1 && index <= threads.length) {
    return threads[index - 1];
  }

  const lowered = value.toLowerCase();
  const idMatches = threads.filter((thread) => thread.id.toLowerCase().startsWith(lowered));
  if (idMatches.length === 1) return idMatches[0];
  if (idMatches.length > 1) throw new Error(`Thread selector matched ${idMatches.length} thread ids. Use a longer id prefix.`);

  const titleMatches = threads.filter((thread) => thread.title.toLowerCase().includes(lowered));
  if (titleMatches.length === 1) return titleMatches[0];
  if (titleMatches.length > 1) {
    throw new Error(`Thread selector matched ${titleMatches.length} titles. Use /threads <query> or a thread id prefix.`);
  }

  throw new Error(`No desktop thread matched "${value}".`);
}

export async function getThreadById({ databasePath, threadId }) {
  const result = await runPythonJson(databasePath, "thread", threadId);
  if (!result?.id) throw new Error(`Bound thread ${threadId} was not found in ${databasePath}.`);
  return {
    id: result.id,
    title: result.title || "Untitled Codex thread",
    rolloutPath: normalizePathValue(result.rollout_path),
    source: result.source,
    cwd: normalizePathValue(result.cwd),
    updatedAtMs: result.updated_at_ms || 0
  };
}

export async function verifyRolloutPath({ threadId, rolloutPath }) {
  if (!rolloutPath) throw new Error("Thread has no rollout_path.");
  await access(rolloutPath);
  if (!path.basename(rolloutPath).includes(threadId)) {
    const head = await readFileHead(rolloutPath, 128 * 1024);
    if (!head.includes(threadId)) {
      throw new Error(`Rollout path exists but does not contain bound thread id ${threadId}.`);
    }
  }
  return true;
}

async function inspectStateDatabase(databasePath) {
  const result = await runPythonJson(databasePath, "schema");
  const columns = result.columns || [];
  const missing = REQUIRED_THREAD_COLUMNS.filter((column) => !columns.includes(column));
  return { ok: missing.length === 0, columns, missing, error: missing.length ? `Missing columns: ${missing.join(", ")}` : "" };
}

async function readFileHead(filePath, bytes) {
  const buffer = await readFile(filePath);
  return buffer.subarray(0, bytes).toString("utf8");
}

async function runPythonJson(databasePath, mode, arg = "") {
  const script = String.raw`
import json
import sqlite3
import sys

db_path = sys.argv[1]
mode = sys.argv[2]
arg = sys.argv[3] if len(sys.argv) > 3 else ""

con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
con.row_factory = sqlite3.Row
cur = con.cursor()

if mode == "schema":
    tables = [row[0] for row in cur.execute("select name from sqlite_master where type='table'")]
    if "threads" not in tables:
        print(json.dumps({"columns": []}))
    else:
        columns = [row[1] for row in cur.execute("pragma table_info(threads)")]
        print(json.dumps({"columns": columns}))
elif mode == "candidate":
    row = cur.execute("""
        select id, title, rollout_path, source, updated_at_ms, cwd
        from threads
        where archived = 0 and source = 'vscode'
        order by updated_at_ms desc, id desc
        limit 1
    """).fetchone()
    print(json.dumps(dict(row) if row else {}))
elif mode == "list":
    params = json.loads(arg or "{}")
    query = (params.get("query") or "").strip().lower()
    limit = int(params.get("limit") or 10)
    limit = max(1, min(limit, 30))
    if query:
        rows = cur.execute("""
            select id, title, rollout_path, source, updated_at_ms, cwd
            from threads
            where archived = 0
              and source = 'vscode'
              and (lower(title) like ? or lower(id) like ?)
            order by updated_at_ms desc, id desc
            limit ?
        """, (f"%{query}%", f"{query}%", limit)).fetchall()
    else:
        rows = cur.execute("""
            select id, title, rollout_path, source, updated_at_ms, cwd
            from threads
            where archived = 0 and source = 'vscode'
            order by updated_at_ms desc, id desc
            limit ?
        """, (limit,)).fetchall()
    print(json.dumps({"threads": [dict(row) for row in rows]}))
elif mode == "thread":
    row = cur.execute("""
        select id, title, rollout_path, source, updated_at_ms, cwd
        from threads
        where id = ?
        limit 1
    """, (arg,)).fetchone()
    print(json.dumps(dict(row) if row else {}))
else:
    raise SystemExit(f"unknown mode: {mode}")
con.close()
`;
  const { stdout } = await runFile("python", ["-c", script, databasePath, mode, arg], {
    maxBuffer: 1024 * 1024
  });
  return JSON.parse(stdout || "{}");
}

function normalizeThreadRow(row) {
  return {
    id: row.id,
    title: row.title || "Untitled Codex thread",
    rolloutPath: normalizePathValue(row.rollout_path),
    source: row.source,
    cwd: normalizePathValue(row.cwd),
    updatedAtMs: row.updated_at_ms || 0
  };
}

function normalizePathValue(value) {
  const text = value ? String(value) : "";
  return text.startsWith("\\\\?\\") ? text.slice(4) : text;
}
