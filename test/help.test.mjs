import assert from "node:assert/strict";
import { test } from "node:test";

import { HELP_TEXT } from "../src/help.mjs";

test("help text lists the available Telegram commands", () => {
  for (const command of [
    "/help",
    "/ping",
    "/mode",
    "/updates",
    "/status",
    "/threads",
    "/current",
    "/files",
    "/file",
    "/latest",
    "/bind",
    "/rebind",
    "/open",
    "/unbind",
    "/pause",
    "/resume",
    "/last",
    "/stop"
  ]) {
    assert.match(HELP_TEXT, new RegExp(command.replace("/", "\\/")));
  }
});
