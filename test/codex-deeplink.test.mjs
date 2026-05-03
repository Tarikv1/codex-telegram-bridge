import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCodexThreadUrl, buildOpenUrlPowerShellArgs } from "../src/codex-deeplink.mjs";

test("builds Codex desktop thread deep link", () => {
  assert.equal(
    buildCodexThreadUrl("11111111-1111-4111-8111-111111111111"),
    "codex://threads/11111111-1111-4111-8111-111111111111"
  );
});

test("rejects invalid thread ids for deep links", () => {
  assert.throws(() => buildCodexThreadUrl("not-a-thread"), /Invalid Codex thread id/);
});

test("builds Start-Process arguments for Codex URL", () => {
  const args = buildOpenUrlPowerShellArgs("codex://threads/11111111-1111-4111-8111-111111111111");

  assert.deepEqual(args.slice(0, 4), ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command"]);
  assert.match(args[4], /Start-Process -FilePath \$Url/);
  assert.match(args[4], /\$Url = 'codex:\/\/threads\/11111111-1111-4111-8111-111111111111'/);
});
