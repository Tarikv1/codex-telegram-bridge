import assert from "node:assert/strict";
import { test } from "node:test";

import { TelegramClient } from "../src/telegram.mjs";

test("getUpdates passes an abort signal to Telegram fetch", async () => {
  const previousFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, options) => {
      assert.ok(options?.signal instanceof AbortSignal);
      return { json: async () => ({ ok: true, result: [] }) };
    };

    const telegram = new TelegramClient({ botToken: "token", requestTimeoutMs: 1000 });
    const updates = await telegram.getUpdates({ offset: 10, timeout: 1 });

    assert.deepEqual(updates, []);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("sendMessage passes an abort signal to Telegram fetch", async () => {
  const previousFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, options) => {
      assert.ok(options?.signal instanceof AbortSignal);
      return { json: async () => ({ ok: true, result: {} }) };
    };

    const telegram = new TelegramClient({ botToken: "token", requestTimeoutMs: 1000 });
    await telegram.sendMessage(123, "hello");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

