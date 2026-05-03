import assert from "node:assert/strict";
import { test } from "node:test";

import { BridgeState } from "../src/bridge-state.mjs";

test("bind locks to a thread until rebind or unbind", () => {
  const state = new BridgeState();

  state.bind({ id: "thread-a", title: "First", rolloutPath: "a.jsonl" });
  state.noteCandidate({ id: "thread-b", title: "Second", rolloutPath: "b.jsonl" });

  assert.equal(state.boundThread.id, "thread-a");

  state.rebind({ id: "thread-b", title: "Second", rolloutPath: "b.jsonl" });
  assert.equal(state.boundThread.id, "thread-b");

  state.unbind();
  assert.equal(state.boundThread, null);
});

test("pause blocks input execution but not status inspection", () => {
  const state = new BridgeState();
  state.bind({ id: "thread-a", title: "First", rolloutPath: "a.jsonl" });

  assert.equal(state.canExecuteInput(), true);
  state.pause();
  assert.equal(state.canExecuteInput(), false);
  assert.equal(state.status().paused, true);
  state.resume();
  assert.equal(state.canExecuteInput(), true);
});
