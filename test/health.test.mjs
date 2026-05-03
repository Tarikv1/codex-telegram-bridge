import assert from "node:assert/strict";
import { test } from "node:test";

import { formatPingResponse } from "../src/health.mjs";

test("ping response reports bridge health without forwarding text to Codex", () => {
  const text = formatPingResponse({
    boundThread: { title: "Example desktop chat", id: "11111111-1111-4111-8111-111111111111" },
    inputMode: "codex-exec",
    paused: false
  });

  assert.match(text, /Bridge pong/);
  assert.match(text, /Example desktop chat/);
  assert.match(text, /codex-exec/);
  assert.match(text, /active/);
});
