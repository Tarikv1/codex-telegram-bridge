import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";

import {
  discoverCompatibleStateDatabase,
  getCurrentThreadCandidate,
  listDesktopThreads,
  resolveThreadSelector,
  verifyRolloutPath
} from "../src/codex-state.mjs";

const runFile = promisify(execFile);

async function makeTempHome() {
  return mkdtemp(path.join(os.tmpdir(), "codex-telegram-bridge-"));
}

async function createDb(dbPath, { compatible = true, rows = [] } = {}) {
  await mkdir(path.dirname(dbPath), { recursive: true });
  const script = compatible
    ? `
import sqlite3
con = sqlite3.connect(r'''${dbPath}''')
con.execute('create table threads (id text primary key, title text not null, rollout_path text not null, source text not null, updated_at_ms integer, archived integer not null default 0, cwd text)')
for row in ${JSON.stringify(rows)}:
    con.execute('insert into threads (id,title,rollout_path,source,updated_at_ms,archived,cwd) values (?,?,?,?,?,?,?)', row)
con.commit()
con.close()
`
    : `
import sqlite3
con = sqlite3.connect(r'''${dbPath}''')
con.execute('create table threads (id text primary key, title text not null)')
con.commit()
con.close()
`;
  await runFile("python", ["-c", script]);
}

test("discovers newest compatible state database and skips incompatible schemas", async () => {
  const home = await makeTempHome();
  try {
    const codex = path.join(home, ".codex");
    const bad = path.join(codex, "state_4.sqlite");
    const good = path.join(codex, "state_5.sqlite");
    await createDb(bad, { compatible: false });
    await createDb(good, { compatible: true });

    const found = await discoverCompatibleStateDatabase({ homeDir: home });

    assert.equal(found.databasePath, good);
    assert.equal(found.requiredColumnsPresent, true);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("selects current desktop thread candidate from non-archived vscode threads", async () => {
  const home = await makeTempHome();
  try {
    const codex = path.join(home, ".codex");
    const rolloutOld = path.join(codex, "sessions", "old-thread.jsonl");
    const rolloutNew = path.join(codex, "sessions", "new-thread.jsonl");
    await mkdir(path.dirname(rolloutOld), { recursive: true });
    await writeFile(rolloutOld, `{"type":"session_meta","payload":{"id":"old-thread"}}\n`);
    await writeFile(rolloutNew, `{"type":"session_meta","payload":{"id":"new-thread"}}\n`);
    const db = path.join(codex, "state_5.sqlite");
    await createDb(db, {
      rows: [
        ["old-thread", "Old", rolloutOld, "vscode", 100, 0, path.join(home, "old")],
        ["subagent-thread", "Worker", rolloutNew, "{\"subagent\":{}}", 300, 0, path.join(home, "worker")],
        ["new-thread", "New", rolloutNew, "vscode", 200, 0, path.join(home, "project")],
        ["archived-thread", "Archived", rolloutNew, "vscode", 400, 1, path.join(home, "archived")]
      ]
    });

    const candidate = await getCurrentThreadCandidate({ databasePath: db });

    assert.equal(candidate.id, "new-thread");
    assert.equal(candidate.title, "New");
    assert.equal(candidate.rolloutPath, rolloutNew);
    assert.equal(candidate.cwd, path.join(home, "project"));
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("lists recent desktop threads and filters by query", async () => {
  const home = await makeTempHome();
  try {
    const codex = path.join(home, ".codex");
    const db = path.join(codex, "state_5.sqlite");
    await createDb(db, {
      rows: [
        ["thread-a", "Example Desktop Chat", "a.jsonl", "vscode", 300, 0, path.join(home, "example")],
        ["thread-b", "Telegram Bridge", "b.jsonl", "vscode", 200, 0, path.join(home, "bridge")],
        ["thread-c", "Archived Emotion", "c.jsonl", "vscode", 400, 1, path.join(home, "archived")],
        ["thread-d", "Worker Emotion", "d.jsonl", "{\"subagent\":{}}", 500, 0, path.join(home, "worker")]
      ]
    });

    const all = await listDesktopThreads({ databasePath: db, limit: 10 });
    const filtered = await listDesktopThreads({ databasePath: db, query: "example", limit: 10 });

    assert.deepEqual(all.map((thread) => thread.id), ["thread-a", "thread-b"]);
    assert.deepEqual(all.map((thread) => thread.cwd), [path.join(home, "example"), path.join(home, "bridge")]);
    assert.deepEqual(filtered.map((thread) => thread.id), ["thread-a"]);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("resolves thread selector by list number, id prefix, or title substring", () => {
  const threads = [
    { id: "11111111-1111-4111-8111-111111111111", title: "Example desktop chat" },
    { id: "22222222-2222-4222-8222-222222222222", title: "Telegram Bridge Plan" }
  ];

  assert.equal(resolveThreadSelector({ selector: "1", threads }).id, threads[0].id);
  assert.equal(resolveThreadSelector({ selector: "22222222", threads }).id, threads[1].id);
  assert.equal(resolveThreadSelector({ selector: "example desktop", threads }).id, threads[0].id);
  assert.throws(() => resolveThreadSelector({ selector: "missing", threads }), /No desktop thread matched/);
});

test("verifies rollout path exists and contains bound thread id", async () => {
  const home = await makeTempHome();
  try {
    const rollout = path.join(home, "rollout-thread-a.jsonl");
    await writeFile(rollout, `{"type":"session_meta","payload":{"id":"thread-a"}}\n`);

    await assert.doesNotReject(() => verifyRolloutPath({ threadId: "thread-a", rolloutPath: rollout }));
    await assert.rejects(
      () => verifyRolloutPath({ threadId: "thread-b", rolloutPath: rollout }),
      /does not contain bound thread id/
    );
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
