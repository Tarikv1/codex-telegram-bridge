import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCodexExecResumeArgs, buildCodexExecSpawnPlan } from "../src/codex-cli.mjs";

test("builds codex exec resume args that target a bound thread id and read prompt from stdin", () => {
  const args = buildCodexExecResumeArgs({
    threadId: "11111111-1111-4111-8111-111111111111",
    json: true
  });

  assert.deepEqual(args, [
    "exec",
    "resume",
    "--json",
    "--skip-git-repo-check",
    "11111111-1111-4111-8111-111111111111",
    "-"
  ]);
});

test("rejects missing codex exec resume thread ids", () => {
  assert.throws(() => buildCodexExecResumeArgs({ threadId: "" }), /thread id/i);
});

test("uses hidden non-detached node launch for Codex CLI on Windows when JS entry exists", () => {
  const plan = buildCodexExecSpawnPlan({
    threadId: "11111111-1111-4111-8111-111111111111",
    codexCommand: "codex",
    codexJsPath: "C:\\Tools\\npm\\node_modules\\@openai\\codex\\bin\\codex.js",
    platform: "win32"
  });

  assert.equal(plan.command, "node.exe");
  assert.equal(plan.args[0], "C:\\Tools\\npm\\node_modules\\@openai\\codex\\bin\\codex.js");
  assert.deepEqual(plan.args.slice(1), [
    "exec",
    "resume",
    "--json",
    "--skip-git-repo-check",
    "11111111-1111-4111-8111-111111111111",
    "-"
  ]);
  assert.equal(plan.options.detached, false);
  assert.equal(plan.options.windowsHide, true);
  assert.deepEqual(plan.options.stdio, ["pipe", "ignore", "pipe"]);
});
