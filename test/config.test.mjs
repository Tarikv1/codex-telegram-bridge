import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { loadConfig, saveRuntimeConfig } from "../src/config.mjs";

test("config loads and persists Telegram chat id plus last update id", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "telegram-bridge-config-"));
  try {
    const configPath = path.join(dir, "telegram-bridge.local.json");
    await writeFile(
      configPath,
      JSON.stringify({
        botToken: "token",
        allowedUserId: "123",
        telegramChatId: "456",
        lastUpdateId: 100,
        boundThreadId: "thread-a"
      }),
      "utf8"
    );

    const config = await loadConfig(configPath);
    assert.equal(config.telegramChatId, "456");
    assert.equal(config.lastUpdateId, 100);
    assert.equal(config.inputMode, "desktop-ui");
    assert.equal(config.fileAccessEnabled, true);
    assert.equal(config.maxFileBytes, 50_000_000);
    assert.equal(config.fileListLimit, 10);
    assert.equal(config.forwardStatusUpdates, true);

    const next = await saveRuntimeConfig(config, { telegramChatId: "789", lastUpdateId: 101 });
    const persisted = JSON.parse(await readFile(configPath, "utf8"));

    assert.equal(next.telegramChatId, "789");
    assert.equal(next.lastUpdateId, 101);
    assert.equal(persisted.telegramChatId, "789");
    assert.equal(persisted.lastUpdateId, 101);
    assert.equal(persisted.inputMode, "desktop-ui");
    assert.equal(persisted.fileAccessEnabled, true);
    assert.equal(persisted.maxFileBytes, 50_000_000);
    assert.equal(persisted.fileListLimit, 10);
    assert.equal(persisted.forwardStatusUpdates, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("config can disable human-facing status updates while keeping answers enabled", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "telegram-bridge-config-"));
  try {
    const configPath = path.join(dir, "telegram-bridge.local.json");
    await writeFile(
      configPath,
      JSON.stringify({
        botToken: "token",
        allowedUserId: "123",
        forwardStatusUpdates: false
      }),
      "utf8"
    );

    const config = await loadConfig(configPath);
    assert.equal(config.forwardStatusUpdates, false);

    await saveRuntimeConfig(config, { forwardStatusUpdates: true });
    const persisted = JSON.parse(await readFile(configPath, "utf8"));
    assert.equal(persisted.forwardStatusUpdates, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("config allows desktop-ui input mode for manual visible-window control", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "telegram-bridge-config-"));
  try {
    const configPath = path.join(dir, "telegram-bridge.local.json");
    await writeFile(
      configPath,
      JSON.stringify({
        botToken: "token",
        allowedUserId: "123",
        inputMode: "desktop-ui"
      }),
      "utf8"
    );

    const config = await loadConfig(configPath);

    assert.equal(config.inputMode, "desktop-ui");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("config tolerates UTF-8 BOM written by Windows tools", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "telegram-bridge-config-"));
  try {
    const configPath = path.join(dir, "telegram-bridge.local.json");
    await writeFile(
      configPath,
      `\uFEFF${JSON.stringify({
        botToken: "token",
        allowedUserId: "123"
      })}`,
      "utf8"
    );

    const config = await loadConfig(configPath);

    assert.equal(config.allowedUserId, "123");
    assert.equal(config.inputMode, "desktop-ui");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("config does not guess Telegram chat id from allowed user id", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "telegram-bridge-config-"));
  try {
    const configPath = path.join(dir, "telegram-bridge.local.json");
    await writeFile(
      configPath,
      JSON.stringify({
        botToken: "token",
        allowedUserId: "123"
      }),
      "utf8"
    );

    const config = await loadConfig(configPath);

    assert.equal(config.telegramChatId, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
