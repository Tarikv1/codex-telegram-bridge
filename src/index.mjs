import { setTimeout as sleep } from "node:timers/promises";
import { stat } from "node:fs/promises";

import { AuditLog } from "./audit.mjs";
import { BridgeState } from "./bridge-state.mjs";
import { createIncomingTextDeduper, resolveOutputChatId, shouldPersistTelegramChatId } from "./chat-routing.mjs";
import { sendInputWithCodexExec } from "./codex-cli.mjs";
import { loadConfig, saveRuntimeConfig } from "./config.mjs";
import {
  discoverCompatibleStateDatabase,
  getCurrentThreadCandidate,
  getThreadById,
  listDesktopThreads,
  resolveThreadSelector,
  verifyRolloutPath
} from "./codex-state.mjs";
import { openCodexThread } from "./codex-deeplink.mjs";
import {
  findLatestProjectFile,
  formatBytes,
  formatFileCaption,
  formatFileList,
  listProjectFiles,
  resolveProjectFile
} from "./file-access.mjs";
import { createDeduper } from "./rollout-parser.mjs";
import { RolloutTail } from "./rollout-tail.mjs";
import { TelegramClient } from "./telegram.mjs";
import { sendInputToCodexWindow } from "./windows-control.mjs";
import { HELP_TEXT } from "./help.mjs";
import { formatPingResponse } from "./health.mjs";
import { formatInputModeResponse, parseInputModeArg } from "./input-mode.mjs";
import { waitForFileGrowth } from "./rollout-watch.mjs";

const args = new Set(process.argv.slice(2));

async function main() {
  let config = await loadConfig();
  if (args.has("--dry-run")) config = { ...config, dryRun: true };

  const audit = new AuditLog({ logPath: config.auditPath });
  const state = new BridgeState({ paused: config.paused });
  const telegram = new TelegramClient({ botToken: config.botToken, dryRun: config.dryRun });
  let offset = config.lastUpdateId ? config.lastUpdateId + 1 : 0;
  let databasePath = null;
  let tail = null;
  let lastChatId = config.telegramChatId || null;
  const deduper = createDeduper();
  const incomingDeduper = createIncomingTextDeduper();

  async function refreshDatabase() {
    const discovered = await discoverCompatibleStateDatabase();
    databasePath = discovered.databasePath;
    return discovered;
  }

  async function bindCurrent(chatId, { rebind = false } = {}) {
    await refreshDatabase();
    const candidate = await getCurrentThreadCandidate({ databasePath });
    return bindThread(chatId, candidate, { rebind });
  }

  async function bindThread(chatId, thread, { rebind = false, opened = false } = {}) {
    await verifyRolloutPath({ threadId: thread.id, rolloutPath: thread.rolloutPath });
    if (rebind) state.rebind(thread);
    else state.bind(thread);
    config = await saveRuntimeConfig(config, { boundThreadId: thread.id, paused: state.paused });
    tail = await createTail(thread, chatId);
    await audit.write(rebind ? "rebind" : "bind", { threadId: thread.id, title: thread.title, cwd: thread.cwd, opened });
    await telegram.sendMessage(chatId, `${opened ? "Opened and bound" : "Bound"} to Codex thread:\n${thread.title}\n${thread.id}`);
  }

  async function listThreads(chatId, query = "") {
    await refreshDatabase();
    const threads = await listDesktopThreads({ databasePath, query, limit: 10 });
    state.noteThreadList(threads);
    await audit.write("threads_list", { query, count: threads.length });
    await telegram.sendMessage(chatId, formatThreadList(threads, query));
    return threads;
  }

  async function resolveThreadForCommand(selector) {
    await refreshDatabase();
    const trimmed = selector.trim();
    const threads = state.lastThreadList.length > 0
      ? state.lastThreadList
      : await listDesktopThreads({ databasePath, limit: 10 });
    try {
      return resolveThreadSelector({ selector: trimmed, threads });
    } catch (error) {
      const searched = await listDesktopThreads({ databasePath, query: trimmed, limit: 10 });
      state.noteThreadList(searched);
      return resolveThreadSelector({ selector: trimmed, threads: searched });
    }
  }

  async function createTail(thread, chatId) {
    const nextTail = new RolloutTail({
      threadId: thread.id,
      rolloutPath: thread.rolloutPath,
      deduper,
      startAtEnd: true,
      onEvent: async (event) => {
        const targetChatId = resolveOutputChatId({
          explicitChatId: chatId,
          lastChatId,
          configChatId: config.telegramChatId
        });
        if (!targetChatId) {
          await audit.write("forward_skipped_no_chat", { threadId: thread.id, kind: event.kind, length: event.text.length });
          return;
        }
        await telegram.sendMessage(targetChatId, event.text);
        state.noteForwarded(event);
        await audit.write("forwarded", { threadId: thread.id, kind: event.kind, length: event.text.length, chatId: targetChatId });
      }
    });
    await nextTail.initialize();
    return nextTail;
  }

  async function restoreBoundThread(chatId) {
    if (!config.boundThreadId) return;
    await refreshDatabase();
    const thread = await getThreadById({ databasePath, threadId: config.boundThreadId });
    await verifyRolloutPath({ threadId: thread.id, rolloutPath: thread.rolloutPath });
    state.bind(thread);
    tail = await createTail(thread, chatId);
  }

  async function pollTailSafely() {
    if (!tail) return;
    try {
      await tail.poll();
    } catch (error) {
      state.lastError = error.message;
      await audit.write("tail_error", { threadId: state.boundThread?.id || null, error: error.message });
      console.error(error.message);
    }
  }

  async function handleCommand(chatId, text) {
    const [command, ...rest] = text.trim().split(/\s+/);
    const arg = rest.join(" ").trim();
    if (command === "/help") return telegram.sendMessage(chatId, HELP_TEXT);
    if (command === "/ping") {
      await audit.write("ping", { chatId, boundThreadId: state.boundThread?.id || null, inputMode: config.inputMode });
      return telegram.sendMessage(chatId, formatPingResponse({
        boundThread: state.boundThread,
        inputMode: config.inputMode,
        paused: state.paused
      }));
    }
    if (command === "/mode") {
      if (!arg) return telegram.sendMessage(chatId, formatInputModeResponse(config.inputMode));
      const inputMode = parseInputModeArg(arg);
      config = await saveRuntimeConfig(config, { inputMode });
      await audit.write("mode", { inputMode });
      return telegram.sendMessage(chatId, formatInputModeResponse(inputMode, { changed: true }));
    }
    if (command === "/threads") return listThreads(chatId, arg);
    if (command === "/current") return telegram.sendMessage(chatId, formatCurrentThread(state.boundThread));
    if (command === "/files" || command === "/file" || command === "/latest") {
      return handleFileCommand(chatId, command, arg);
    }
    if (command === "/bind") {
      if (!arg) return bindCurrent(chatId);
      const thread = await resolveThreadForCommand(arg);
      return bindThread(chatId, thread);
    }
    if (command === "/rebind") {
      if (!arg) return bindCurrent(chatId, { rebind: true });
      const thread = await resolveThreadForCommand(arg);
      return bindThread(chatId, thread, { rebind: true });
    }
    if (command === "/open") {
      if (!arg) return telegram.sendMessage(chatId, "Use /open <number, title, or thread id>. Try /threads first.");
      const thread = await resolveThreadForCommand(arg);
      const openResult = await openCodexThread(thread.id, { dryRun: config.dryRun });
      await audit.write("open_thread", { threadId: thread.id, title: thread.title, dryRun: config.dryRun, url: openResult.url });
      return bindThread(chatId, thread, { rebind: true, opened: true });
    }
    if (command === "/unbind") {
      state.unbind();
      tail = null;
      config = await saveRuntimeConfig(config, { boundThreadId: null });
      await audit.write("unbind");
      return telegram.sendMessage(chatId, "Unbound. Send /bind when the target Codex desktop chat is open.");
    }
    if (command === "/pause" || command === "/stop") {
      state.pause();
      config = await saveRuntimeConfig(config, { paused: true });
      await audit.write("pause", { command });
      return telegram.sendMessage(chatId, "Bridge paused. Status mirroring remains available; Telegram input will not execute until /resume.");
    }
    if (command === "/resume") {
      state.resume();
      config = await saveRuntimeConfig(config, { paused: false });
      await audit.write("resume");
      return telegram.sendMessage(chatId, "Bridge resumed.");
    }
    if (command === "/last") {
      return telegram.sendMessage(chatId, state.lastAssistantText || state.lastStatusText || "No forwarded Codex message yet.");
    }
    if (command === "/status") {
      return telegram.sendMessage(chatId, formatStatus(state.status(), {
        databasePath,
        dryRun: config.dryRun,
        inputMode: config.inputMode,
        fileAccessEnabled: config.fileAccessEnabled,
        maxFileBytes: config.maxFileBytes
      }));
    }
    return telegram.sendMessage(chatId, `Unknown command: ${command}`);
  }

  async function handleFileCommand(chatId, command, arg) {
    try {
      assertFileAccessReady();
      if (command === "/files") {
        const files = await listProjectFiles({
          thread: state.boundThread,
          query: arg,
          limit: config.fileListLimit,
          maxFileBytes: config.maxFileBytes
        });
        state.noteFileList(files);
        await audit.write("files_list", { query: arg, count: files.length });
        return telegram.sendMessage(chatId, formatFileList(files, arg));
      }

      const file = command === "/latest"
        ? await findLatestProjectFile({ thread: state.boundThread, query: arg, maxFileBytes: config.maxFileBytes })
        : await resolveProjectFile({
          thread: state.boundThread,
          selector: arg,
          lastFileList: state.lastFileList,
          maxFileBytes: config.maxFileBytes
        });

      await audit.write(command === "/latest" ? "latest_file_send" : "file_send", {
        relativePath: file.relativePath,
        size: file.size
      });
      return telegram.sendDocument(chatId, file.absolutePath, {
        filename: file.fileName,
        caption: formatFileCaption(file)
      });
    } catch (error) {
      state.lastError = error.message;
      await audit.write("file_failed", { command, length: arg.length, error: error.message });
      return telegram.sendMessage(chatId, `File request was not completed: ${error.message}`);
    }
  }

  function assertFileAccessReady() {
    if (!config.fileAccessEnabled) throw new Error("File access is disabled in the local bridge config.");
    if (!state.boundThread) throw new Error("No Codex thread is bound. Use /threads, then /bind <number> first.");
  }

  async function rememberTelegramChat(chatId) {
    lastChatId = String(chatId);
    if (shouldPersistTelegramChatId({ currentChatId: config.telegramChatId, nextChatId: chatId })) {
      config = await saveRuntimeConfig(config, { telegramChatId: String(chatId) });
    }
  }

  async function handleMessage(update) {
    const message = update.message;
    if (!message?.text) return;
    const senderId = String(message.from?.id || "");
    const chatId = message.chat?.id;
    lastChatId = chatId;

    if (senderId !== config.allowedUserId) {
      await audit.write("rejected_sender", { senderId, chatId });
      return;
    }
    await rememberTelegramChat(chatId);

    const text = message.text.trim();
    if (text.startsWith("/")) return handleCommand(chatId, text);
    if (!state.canExecuteInput()) {
      return telegram.sendMessage(chatId, state.boundThread ? "Bridge is paused. Send /resume to allow Telegram input." : "No Codex thread is bound. Open the target chat and send /bind first.");
    }
    if (!incomingDeduper.shouldExecute({ chatId, senderId, text })) {
      await audit.write("input_duplicate_skipped", { senderId, chatId, length: text.length });
      return;
    }

    try {
      let result;
      if (config.inputMode === "desktop-ui") {
        const rolloutBefore = await stat(state.boundThread.rolloutPath);
        const openResult = await openCodexThread(state.boundThread.id, { dryRun: config.dryRun });
        await audit.write("open_before_input", { threadId: state.boundThread.id, dryRun: config.dryRun, url: openResult.url });
        if (!config.dryRun) await sleep(1000);
        result = await sendInputToCodexWindow(text, {
          processName: config.codexWindowProcessName,
          dryRun: config.dryRun
        });
        if (!config.dryRun) {
          await waitForFileGrowth(state.boundThread.rolloutPath, { fromSize: rolloutBefore.size });
        }
      } else {
        result = await sendInputWithCodexExec(text, {
          threadId: state.boundThread.id,
          codexCommand: config.codexCommand,
          cwd: state.boundThread.cwd,
          dryRun: config.dryRun
        });
      }
      if (result.clipboardRestoreFailed) state.clipboardRestoreFailed = true;
      await audit.write("input_sent", {
        threadId: state.boundThread.id,
        length: text.length,
        dryRun: config.dryRun,
        inputMode: config.inputMode,
        cwd: state.boundThread.cwd,
        processId: result.processId
      });
    } catch (error) {
      state.lastError = error.message;
      await audit.write("input_failed", { threadId: state.boundThread.id, length: text.length, error: error.message });
      return telegram.sendMessage(chatId, `Input was not sent: ${error.message}`);
    }
  }

  if (config.boundThreadId) {
    await restoreBoundThread(null).catch(async (error) => {
      state.lastError = error.message;
      await audit.write("restore_failed", { error: error.message });
    });
  }

  console.log(`Telegram Codex bridge running${config.dryRun ? " in dry-run mode" : ""}.`);
  while (true) {
    try {
      await pollTailSafely();
      const updates = await telegram.getUpdates({ offset, timeout: 5 });
      for (const update of updates) {
        offset = Math.max(offset, update.update_id + 1);
        try {
          await handleMessage(update);
        } finally {
          if (update.update_id > (config.lastUpdateId || 0)) {
            config = await saveRuntimeConfig(config, { lastUpdateId: update.update_id });
          }
        }
      }
      await pollTailSafely();
    } catch (error) {
      state.lastError = error.message;
      await audit.write("loop_error", { error: error.message });
      console.error(error.message);
      await pollTailSafely();
      await sleep(3000);
    }
    await sleep(config.pollIntervalMs);
  }
}

function formatStatus(status, { databasePath, dryRun, inputMode, fileAccessEnabled, maxFileBytes }) {
  const bound = status.boundThread
    ? `${status.boundThread.title}\n${status.boundThread.id}\n${status.boundThread.rolloutPath}\n${status.boundThread.cwd || "cwd unknown"}`
    : "none";
  return [
    `Bridge status: ${status.paused ? "paused" : "active"}`,
    `Dry run: ${dryRun ? "yes" : "no"}`,
    `Input mode: ${inputMode || "unknown"}`,
    `File access: ${fileAccessEnabled ? `enabled, ${formatBytes(maxFileBytes)} max` : "disabled"}`,
    `State DB: ${databasePath || "not discovered yet"}`,
    `Bound thread: ${bound}`,
    `Clipboard restore issue: ${status.clipboardRestoreFailed ? "yes" : "no"}`,
    `Last error: ${status.lastError || "none"}`
  ].join("\n");
}

function formatThreadList(threads, query) {
  if (threads.length === 0) {
    return query ? `No desktop Codex chats matched "${query}".` : "No desktop Codex chats found.";
  }
  const header = query ? `Recent desktop Codex chats matching "${query}":` : "Recent desktop Codex chats:";
  const lines = threads.map((thread, index) => {
    const age = formatAge(thread.updatedAtMs);
    return `${index + 1}. ${thread.title}\n${thread.id}\n${age}`;
  });
  return `${header}\n\n${lines.join("\n\n")}\n\nUse /bind <number>, /open <number>, or /bind <title>.`;
}

function formatCurrentThread(thread) {
  if (!thread) return "No Codex thread is bound. Use /threads, then /bind <number> or /open <number>.";
  return `Current bound Codex thread:\n${thread.title}\n${thread.id}\n${thread.rolloutPath}\n${thread.cwd || "cwd unknown"}`;
}

function formatAge(updatedAtMs) {
  if (!updatedAtMs) return "updated time unknown";
  const seconds = Math.max(0, Math.round((Date.now() - updatedAtMs) / 1000));
  if (seconds < 90) return "updated just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `updated ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `updated ${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `updated ${days} days ago`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
