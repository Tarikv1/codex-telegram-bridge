import assert from "node:assert/strict";
import { test } from "node:test";

import { formatInputModeResponse, normalizeInputMode, parseInputModeArg } from "../src/input-mode.mjs";

test("input mode defaults to desktop-ui for visible Codex desktop control", () => {
  assert.equal(normalizeInputMode(undefined), "desktop-ui");
  assert.equal(normalizeInputMode(""), "desktop-ui");
});

test("input mode parser accepts visible desktop and headless exec aliases", () => {
  assert.equal(parseInputModeArg("desktop"), "desktop-ui");
  assert.equal(parseInputModeArg("ui"), "desktop-ui");
  assert.equal(parseInputModeArg("desktop-ui"), "desktop-ui");
  assert.equal(parseInputModeArg("exec"), "codex-exec");
  assert.equal(parseInputModeArg("cli"), "codex-exec");
  assert.equal(parseInputModeArg("codex-exec"), "codex-exec");
});

test("input mode parser rejects unknown modes", () => {
  assert.throws(() => parseInputModeArg("telegram"), /Unknown input mode/);
});

test("input mode response explains desktop-ui writes to the visible Codex window", () => {
  assert.match(formatInputModeResponse("desktop-ui"), /visible Codex desktop window/);
  assert.match(formatInputModeResponse("codex-exec"), /may not appear in the desktop window/);
});
