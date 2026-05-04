import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { acquireSingleInstanceLock } from "../src/single-instance.mjs";

test("single instance lock refuses a second live bridge process", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "telegram-bridge-lock-"));
  const lockPath = path.join(dir, "bridge.lock.json");
  const first = await acquireSingleInstanceLock({ lockPath });

  try {
    await assert.rejects(
      () => acquireSingleInstanceLock({ lockPath }),
      /already running/
    );
  } finally {
    await first.release();
    await rm(dir, { recursive: true, force: true });
  }
});

test("single instance lock replaces stale pid files", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "telegram-bridge-lock-"));
  const lockPath = path.join(dir, "bridge.lock.json");

  await acquireSingleInstanceLock.writeStaleLockForTest(lockPath, { pid: 99999999 });
  const lock = await acquireSingleInstanceLock({ lockPath });

  try {
    assert.equal(lock.pid, process.pid);
  } finally {
    await lock.release();
    await rm(dir, { recursive: true, force: true });
  }
});
