import assert from "node:assert/strict";
import { test } from "node:test";

import { createIncomingTextDeduper, resolveOutputChatId, shouldPersistTelegramChatId } from "../src/chat-routing.mjs";

test("output chat id prefers explicit command chat and falls back to remembered config chat", () => {
  assert.equal(resolveOutputChatId({ explicitChatId: 10, lastChatId: 20, configChatId: 30 }), "10");
  assert.equal(resolveOutputChatId({ explicitChatId: null, lastChatId: 20, configChatId: 30 }), "20");
  assert.equal(resolveOutputChatId({ explicitChatId: null, lastChatId: null, configChatId: 30 }), "30");
  assert.equal(resolveOutputChatId({ explicitChatId: null, lastChatId: null, configChatId: null }), null);
});

test("chat id persistence only writes when a real chat id changes", () => {
  assert.equal(shouldPersistTelegramChatId({ currentChatId: "10", nextChatId: 10 }), false);
  assert.equal(shouldPersistTelegramChatId({ currentChatId: "10", nextChatId: 11 }), true);
  assert.equal(shouldPersistTelegramChatId({ currentChatId: null, nextChatId: 11 }), true);
  assert.equal(shouldPersistTelegramChatId({ currentChatId: null, nextChatId: null }), false);
});

test("incoming text deduper skips repeated Telegram input in a short window", () => {
  const deduper = createIncomingTextDeduper({ windowMs: 30000 });

  assert.equal(deduper.shouldExecute({ chatId: 10, senderId: 20, text: "test", nowMs: 1000 }), true);
  assert.equal(deduper.shouldExecute({ chatId: 10, senderId: 20, text: "test", nowMs: 2000 }), false);
  assert.equal(deduper.shouldExecute({ chatId: 10, senderId: 20, text: "different", nowMs: 3000 }), true);
  assert.equal(deduper.shouldExecute({ chatId: 10, senderId: 21, text: "test", nowMs: 4000 }), true);
  assert.equal(deduper.shouldExecute({ chatId: 11, senderId: 20, text: "test", nowMs: 5000 }), true);
  assert.equal(deduper.shouldExecute({ chatId: 10, senderId: 20, text: "test", nowMs: 32000 }), true);
});
