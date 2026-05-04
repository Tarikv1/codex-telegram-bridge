import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatUpdatesResponse,
  parseUpdatesArg,
  shouldForwardEvent
} from "../src/output-routing.mjs";

test("status updates can be disabled without blocking assistant answers", () => {
  assert.equal(
    shouldForwardEvent({ kind: "status", text: "Working..." }, { forwardStatusUpdates: false }),
    false
  );
  assert.equal(
    shouldForwardEvent({ kind: "assistant", text: "Final answer" }, { forwardStatusUpdates: false }),
    true
  );
  assert.equal(
    shouldForwardEvent({ kind: "status", text: "Working..." }, { forwardStatusUpdates: true }),
    true
  );
});

test("updates command parser accepts on and off aliases", () => {
  assert.equal(parseUpdatesArg("on"), true);
  assert.equal(parseUpdatesArg("enable"), true);
  assert.equal(parseUpdatesArg("off"), false);
  assert.equal(parseUpdatesArg("disable"), false);
  assert.equal(parseUpdatesArg(""), null);
  assert.throws(() => parseUpdatesArg("maybe"), /Use \/updates on or \/updates off/);
});

test("updates response describes the current setting", () => {
  assert.match(formatUpdatesResponse(true), /enabled/);
  assert.match(formatUpdatesResponse(false, { changed: true }), /disabled/);
  assert.match(formatUpdatesResponse(false, { changed: true }), /Final assistant answers/);
});
