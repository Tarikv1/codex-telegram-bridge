import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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

test("sendDocument uploads files with multipart form data", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codex-telegram-bridge-upload-"));
  const filePath = path.join(root, "demo.html");
  await mkdir(root, { recursive: true });
  await writeFile(filePath, "<html></html>");

  const previousFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.match(String(url), /sendDocument/);
      assert.equal(options.method, "POST");
      assert.ok(options?.signal instanceof AbortSignal);
      assert.ok(options.body instanceof FormData);
      const entries = Array.from(options.body.entries());
      assert.equal(entries.find(([key]) => key === "chat_id")?.[1], "123");
      assert.equal(entries.find(([key]) => key === "caption")?.[1], "demo");
      assert.equal(entries.find(([key]) => key === "document")?.[1]?.name, "demo.html");
      return { json: async () => ({ ok: true, result: { message_id: 1 } }) };
    };

    const telegram = new TelegramClient({ botToken: "token", requestTimeoutMs: 1000 });
    await telegram.sendDocument(123, filePath, { caption: "demo" });
  } finally {
    globalThis.fetch = previousFetch;
  }
});
