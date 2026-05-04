import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export function defaultLockPath() {
  return path.join(os.homedir(), ".codex", "telegram-bridge.lock.json");
}

export async function acquireSingleInstanceLock({ lockPath = defaultLockPath() } = {}) {
  mkdirSync(path.dirname(lockPath), { recursive: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = openSync(lockPath, "wx");
      const lock = {
        pid: process.pid,
        createdAt: new Date().toISOString(),
        lockPath
      };
      writeFileSync(fd, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
      return {
        ...lock,
        release: async () => {
          try {
            closeSync(fd);
          } catch {
            // Already closed during process shutdown.
          }
          rmSync(lockPath, { force: true });
        }
      };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const existing = readExistingLock(lockPath);
      if (isProcessAlive(existing.pid)) {
        throw new Error(`Telegram Codex bridge is already running as PID ${existing.pid}. Stop that process before starting another bridge.`);
      }
      rmSync(lockPath, { force: true });
    }
  }

  throw new Error(`Could not acquire Telegram bridge lock at ${lockPath}.`);
}

acquireSingleInstanceLock.writeStaleLockForTest = async (lockPath, lock) => {
  mkdirSync(path.dirname(lockPath), { recursive: true });
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
};

function readExistingLock(lockPath) {
  try {
    return JSON.parse(readFileSync(lockPath, "utf8"));
  } catch {
    return {};
  }
}

function isProcessAlive(pid) {
  const value = Number(pid);
  if (!Number.isInteger(value) || value <= 0) return false;
  try {
    process.kill(value, 0);
    return true;
  } catch {
    return false;
  }
}
