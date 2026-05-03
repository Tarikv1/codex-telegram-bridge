import assert from "node:assert/strict";
import { mkdir, mkdtemp, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  findLatestProjectFile,
  formatFileList,
  listProjectFiles,
  resolveProjectFile
} from "../src/file-access.mjs";

test("resolves requested files only inside the bound thread working folder", async () => {
  const root = await makeProjectRoot();
  await writeProjectFile(root, "output/demo.wav", "audio");

  const file = await resolveProjectFile({
    thread: { cwd: root },
    selector: "output/demo.wav",
    maxFileBytes: 10_000
  });

  assert.equal(file.relativePath, "output/demo.wav");
  assert.equal(file.size, 5);
  assert.equal(file.absolutePath, path.join(root, "output", "demo.wav"));

  await assert.rejects(
    () => resolveProjectFile({ thread: { cwd: root }, selector: "../outside.txt" }),
    /outside the bound project folder/
  );
});

test("blocks sensitive files and oversized files", async () => {
  const root = await makeProjectRoot();
  await writeProjectFile(root, ".env", "TOKEN=value");
  await writeProjectFile(root, "settings.local.json", "{}");
  await writeProjectFile(root, "state_main.sqlite", "sqlite");
  await writeProjectFile(root, "output/big.bin", Buffer.alloc(12));

  for (const selector of [".env", "settings.local.json", "state_main.sqlite"]) {
    await assert.rejects(
      () => resolveProjectFile({ thread: { cwd: root }, selector }),
      /blocked for safety/
    );
  }

  await assert.rejects(
    () => resolveProjectFile({ thread: { cwd: root }, selector: "output/big.bin", maxFileBytes: 10 }),
    /larger than the configured Telegram file limit/
  );
});

test("lists project files without exposing blocked directories or secret-looking files", async () => {
  const root = await makeProjectRoot();
  await writeProjectFile(root, "dist/index.html", "<html></html>");
  await writeProjectFile(root, "output/demo.wav", "audio");
  await writeProjectFile(root, "node_modules/pkg/index.js", "ignored");
  await writeProjectFile(root, ".git/config", "ignored");
  await writeProjectFile(root, "notes.secret.txt", "ignored");

  const files = await listProjectFiles({ thread: { cwd: root }, query: "", limit: 10 });
  const relativePaths = files.map((file) => file.relativePath).sort();

  assert.deepEqual(relativePaths, ["dist/index.html", "output/demo.wav"]);
});

test("finds the newest matching project file", async () => {
  const root = await makeProjectRoot();
  await writeProjectFile(root, "output/old.wav", "old");
  await writeProjectFile(root, "output/new.wav", "new");
  await utimes(path.join(root, "output", "old.wav"), new Date("2026-01-01"), new Date("2026-01-01"));
  await utimes(path.join(root, "output", "new.wav"), new Date("2026-01-02"), new Date("2026-01-02"));

  const latest = await findLatestProjectFile({ thread: { cwd: root }, query: ".wav", maxFileBytes: 10_000 });

  assert.equal(latest.relativePath, "output/new.wav");
});

test("resolves numbered selections from the last file list", async () => {
  const root = await makeProjectRoot();
  await writeProjectFile(root, "reports/site.html", "<html></html>");
  const info = await stat(path.join(root, "reports", "site.html"));

  const selected = await resolveProjectFile({
    thread: { cwd: root },
    selector: "1",
    lastFileList: [{
      relativePath: "reports/site.html",
      absolutePath: path.join(root, "reports", "site.html"),
      size: info.size,
      mtimeMs: info.mtimeMs
    }],
    maxFileBytes: 10_000
  });

  assert.equal(selected.relativePath, "reports/site.html");
});

test("formats file lists with relative paths only", async () => {
  const message = formatFileList([
    { relativePath: "dist/index.html", size: 1200 },
    { relativePath: "output/demo.wav", size: 2400 }
  ], "");

  assert.match(message, /1\. dist\/index\.html/);
  assert.match(message, /2\. output\/demo\.wav/);
  assert.doesNotMatch(message, /[A-Z]:\\/);
});

async function makeProjectRoot() {
  return mkdtemp(path.join(os.tmpdir(), "codex-telegram-bridge-files-"));
}

async function writeProjectFile(root, relativePath, content) {
  const absolutePath = path.join(root, ...relativePath.split("/"));
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content);
}
