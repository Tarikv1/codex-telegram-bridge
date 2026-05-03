import { readdir, stat } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_MAX_FILE_BYTES = 50_000_000;
const DEFAULT_LIST_LIMIT = 10;
const MAX_SCANNED_FILES = 5000;

const BLOCKED_DIRECTORY_NAMES = new Set([
  ".codex",
  ".git",
  ".hg",
  ".svn",
  ".tmp",
  ".venv",
  "coverage",
  "node_modules",
  "venv"
]);

const BLOCKED_FILE_SUFFIXES = [
  ".audit.ndjson",
  ".db",
  ".env",
  ".local.json",
  ".sqlite",
  ".sqlite3"
];

const SENSITIVE_NAME_PATTERN = /(^|[._-])(api-key|apikey|credential|password|private|secret|token)([._-]|$)/i;

export async function listProjectFiles({ thread, query = "", limit = DEFAULT_LIST_LIMIT, maxFileBytes = DEFAULT_MAX_FILE_BYTES } = {}) {
  const root = await requireProjectRoot(thread);
  const files = [];
  let scanned = 0;

  async function visit(directory) {
    if (scanned >= MAX_SCANNED_FILES) return;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (scanned >= MAX_SCANNED_FILES) return;
      const absolutePath = path.join(directory, entry.name);
      const relativePath = toPortableRelative(root, absolutePath);
      if (!relativePath || isBlockedRelativePath(relativePath)) continue;

      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;

      scanned += 1;
      let info;
      try {
        info = await stat(absolutePath);
      } catch {
        continue;
      }
      if (info.size > maxFileBytes || !matchesQuery(relativePath, query)) continue;
      files.push({
        absolutePath,
        relativePath,
        size: info.size,
        mtimeMs: info.mtimeMs
      });
    }
  }

  await visit(root);
  files.sort((a, b) => b.mtimeMs - a.mtimeMs || a.relativePath.localeCompare(b.relativePath));
  return files.slice(0, normalizeLimit(limit));
}

export async function findLatestProjectFile({ thread, query, maxFileBytes = DEFAULT_MAX_FILE_BYTES } = {}) {
  const value = String(query || "").trim();
  if (!value) throw new Error("Use /latest <extension or search text>, for example /latest .wav.");
  const files = await listProjectFiles({ thread, query: value, limit: 1, maxFileBytes });
  if (files.length === 0) throw new Error(`No sendable project file matched "${value}".`);
  return files[0];
}

export async function resolveProjectFile({ thread, selector, lastFileList = [], maxFileBytes = DEFAULT_MAX_FILE_BYTES } = {}) {
  const root = await requireProjectRoot(thread);
  const requested = resolveSelector(selector, lastFileList);
  if (!requested) throw new Error("Use /file <relative path or number from /files>.");

  const absolutePath = path.resolve(root, requested);
  if (!isInsideOrSame(root, absolutePath)) {
    throw new Error("File request is outside the bound project folder.");
  }

  const relativePath = toPortableRelative(root, absolutePath);
  if (!relativePath || isBlockedRelativePath(relativePath)) {
    throw new Error("That file path is blocked for safety.");
  }

  let info;
  try {
    info = await stat(absolutePath);
  } catch {
    throw new Error("File was not found under the bound project folder.");
  }
  if (!info.isFile()) throw new Error("Requested path is not a file.");
  if (info.size > maxFileBytes) {
    throw new Error(`File is larger than the configured Telegram file limit (${formatBytes(maxFileBytes)}).`);
  }

  return {
    absolutePath,
    relativePath,
    size: info.size,
    mtimeMs: info.mtimeMs,
    fileName: path.basename(absolutePath)
  };
}

export function formatFileList(files, query = "") {
  const label = String(query || "").trim();
  if (!files.length) {
    return label ? `No sendable project files matched "${label}".` : "No sendable project files found in the bound project folder.";
  }
  const header = label ? `Sendable project files matching "${label}":` : "Recent sendable project files:";
  const lines = files.map((file, index) => `${index + 1}. ${file.relativePath}\n${formatBytes(file.size)}`);
  return `${header}\n\n${lines.join("\n\n")}\n\nUse /file <number> or /file <relative path>.`;
}

export function formatFileCaption(file) {
  return `Codex file: ${file.relativePath}\n${formatBytes(file.size)}`;
}

export function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1000) return `${value} B`;
  const units = ["KB", "MB", "GB"];
  let size = value;
  let unit = "B";
  for (const nextUnit of units) {
    size /= 1000;
    unit = nextUnit;
    if (size < 1000) break;
  }
  return `${size >= 10 ? size.toFixed(0) : size.toFixed(1)} ${unit}`;
}

async function requireProjectRoot(thread) {
  const root = thread?.cwd ? path.resolve(String(thread.cwd)) : "";
  if (!root) throw new Error("Bound thread has no working folder recorded.");
  let info;
  try {
    info = await stat(root);
  } catch {
    throw new Error("Bound thread working folder is not available.");
  }
  if (!info.isDirectory()) throw new Error("Bound thread working folder is not a directory.");
  return root;
}

function resolveSelector(selector, lastFileList) {
  const value = String(selector || "").trim();
  if (!value) return "";
  const index = Number(value);
  if (Number.isInteger(index) && index >= 1 && index <= lastFileList.length) {
    return lastFileList[index - 1].relativePath;
  }
  return value;
}

function isBlockedRelativePath(relativePath) {
  const normalized = String(relativePath || "").replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  if (!segments.length) return true;
  if (segments.some((segment) => BLOCKED_DIRECTORY_NAMES.has(segment.toLowerCase()))) return true;

  const fileName = segments.at(-1).toLowerCase();
  if (BLOCKED_FILE_SUFFIXES.some((suffix) => fileName === suffix.slice(1) || fileName.endsWith(suffix))) return true;
  return SENSITIVE_NAME_PATTERN.test(fileName);
}

function matchesQuery(relativePath, query) {
  const value = String(query || "").trim().toLowerCase().replace(/\\/g, "/");
  if (!value) return true;
  const target = relativePath.toLowerCase();
  if (value.startsWith("*.")) return target.endsWith(value.slice(1));
  if (value.startsWith(".")) return target.endsWith(value);
  return target.includes(value);
}

function toPortableRelative(root, absolutePath) {
  return path.relative(root, absolutePath).split(path.sep).join("/");
}

function isInsideOrSame(root, absolutePath) {
  const relativePath = path.relative(root, absolutePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function normalizeLimit(limit) {
  const value = Number(limit || DEFAULT_LIST_LIMIT);
  if (!Number.isFinite(value)) return DEFAULT_LIST_LIMIT;
  return Math.max(1, Math.min(30, Math.trunc(value)));
}
