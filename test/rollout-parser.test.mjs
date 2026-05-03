import assert from "node:assert/strict";
import { test } from "node:test";

import { parseRolloutLine, shouldForwardEvent, createDeduper } from "../src/rollout-parser.mjs";

test("extracts human-facing agent status messages", () => {
  const line = JSON.stringify({
    timestamp: "2026-05-03T17:45:00.000Z",
    type: "event_msg",
    payload: { type: "agent_message", message: "I will verify the local files first.", phase: "working" }
  });

  const event = parseRolloutLine(line);

  assert.deepEqual(event, {
    timestamp: "2026-05-03T17:45:00.000Z",
    kind: "status",
    text: "I will verify the local files first."
  });
  assert.equal(shouldForwardEvent(event), true);
});

test("extracts assistant visible output text", () => {
  const line = JSON.stringify({
    timestamp: "2026-05-03T17:46:00.000Z",
    type: "response_item",
    payload: {
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: "Here is the final answer." }]
    }
  });

  const event = parseRolloutLine(line);

  assert.deepEqual(event, {
    timestamp: "2026-05-03T17:46:00.000Z",
    kind: "assistant",
    text: "Here is the final answer."
  });
});

test("classifies final answer agent messages as assistant output", () => {
  const line = JSON.stringify({
    timestamp: "2026-05-03T17:47:00.000Z",
    type: "event_msg",
    payload: { type: "agent_message", message: "Final answer from desktop.", phase: "final_answer" }
  });

  const event = parseRolloutLine(line);

  assert.deepEqual(event, {
    timestamp: "2026-05-03T17:47:00.000Z",
    kind: "assistant",
    text: "Final answer from desktop."
  });
});

test("ignores worklog, reasoning, token, user, and tool events", () => {
  const ignored = [
    { type: "event_msg", payload: { type: "token_count" } },
    { type: "event_msg", payload: { type: "exec_command_end", message: "npm test" } },
    { type: "response_item", payload: { type: "reasoning", encrypted_content: "secret" } },
    { type: "response_item", payload: { type: "function_call", name: "shell_command" } },
    { type: "response_item", payload: { type: "function_call_output", output: "raw output" } },
    { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "hello" }] } },
    { type: "response_item", payload: { type: "message", role: "developer", content: [{ type: "input_text", text: "rules" }] } }
  ];

  for (const item of ignored) {
    assert.equal(parseRolloutLine(JSON.stringify(item)), null);
  }
});

test("deduplicates same text for the same thread in a short window", () => {
  const dedupe = createDeduper({ windowMs: 5000 });
  const event = { kind: "status", text: "Same visible message.", timestamp: "2026-05-03T17:45:00.000Z" };

  assert.equal(dedupe.shouldSend("thread-a", event), true);
  assert.equal(dedupe.shouldSend("thread-a", event), false);
  assert.equal(dedupe.shouldSend("thread-b", event), true);
  assert.equal(dedupe.shouldSend("thread-a", { ...event, timestamp: "2026-05-03T17:45:06.000Z" }), true);
});

test("deduplicates same visible text across event forms", () => {
  const dedupe = createDeduper({ windowMs: 5000 });

  assert.equal(
    dedupe.shouldSend("thread-a", { kind: "status", text: "Visible once.", timestamp: "2026-05-03T17:45:00.000Z" }),
    true
  );
  assert.equal(
    dedupe.shouldSend("thread-a", { kind: "assistant", text: "Visible once.", timestamp: "2026-05-03T17:45:01.000Z" }),
    false
  );
});
