import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, appendFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { test } from "node:test";

import { waitForFileGrowth } from "../src/rollout-watch.mjs";

test("waits until a rollout file grows past the original size", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "telegram-rollout-watch-"));
  try {
    const file = path.join(dir, "rollout.jsonl");
    await writeFile(file, "one\n", "utf8");
    const grow = sleep(30).then(() => appendFile(file, "two\n", "utf8"));

    await waitForFileGrowth(file, { fromSize: 4, timeoutMs: 1000, intervalMs: 10 });
    await grow;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("reports when desktop input does not change the rollout file", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "telegram-rollout-watch-"));
  try {
    const file = path.join(dir, "rollout.jsonl");
    await writeFile(file, "one\n", "utf8");

    await assert.rejects(
      () => waitForFileGrowth(file, { fromSize: 4, timeoutMs: 20, intervalMs: 5 }),
      /rollout file did not change/
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
