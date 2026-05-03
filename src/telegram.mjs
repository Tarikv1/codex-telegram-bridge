import { readFile } from "node:fs/promises";
import path from "node:path";

export class TelegramClient {
  constructor({ botToken, dryRun = false, logger = console, requestTimeoutMs = 15000 }) {
    this.botToken = botToken;
    this.dryRun = dryRun;
    this.logger = logger;
    this.requestTimeoutMs = requestTimeoutMs;
  }

  async getUpdates({ offset = 0, timeout = 25 } = {}) {
    if (this.dryRun) return [];
    const url = this.apiUrl("getUpdates", { offset, timeout, allowed_updates: JSON.stringify(["message"]) });
    const response = await fetchWithTimeout(url, {
      timeoutMs: Math.max(this.requestTimeoutMs, (Number(timeout) || 0) * 1000 + 5000),
      label: "Telegram getUpdates"
    });
    const body = await response.json();
    if (!body.ok) throw new Error(`Telegram getUpdates failed: ${body.description || response.status}`);
    return body.result || [];
  }

  async sendMessage(chatId, text) {
    if (chatId === null || chatId === undefined || String(chatId).trim() === "") {
      throw new Error("Telegram chat id is required to send a message.");
    }
    const chunks = splitTelegramText(text);
    for (const chunk of chunks) {
      if (this.dryRun) {
        this.logger.log(`[dry-run telegram -> ${chatId}] ${chunk}`);
        continue;
      }
      const response = await fetchWithTimeout(this.apiUrl("sendMessage"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: chunk }),
        timeoutMs: this.requestTimeoutMs,
        label: "Telegram sendMessage"
      });
      const body = await response.json();
      if (!body.ok) throw new Error(`Telegram sendMessage failed: ${body.description || response.status}`);
    }
  }

  async sendDocument(chatId, filePath, { caption = "", filename = "" } = {}) {
    if (chatId === null || chatId === undefined || String(chatId).trim() === "") {
      throw new Error("Telegram chat id is required to send a file.");
    }
    const resolvedName = filename || path.basename(filePath);
    if (this.dryRun) {
      this.logger.log(`[dry-run telegram file -> ${chatId}] ${resolvedName}${caption ? `\n${caption}` : ""}`);
      return;
    }

    const form = new FormData();
    form.set("chat_id", String(chatId));
    if (caption) form.set("caption", String(caption));
    const bytes = await readFile(filePath);
    form.set("document", new Blob([bytes], { type: "application/octet-stream" }), resolvedName);

    const response = await fetchWithTimeout(this.apiUrl("sendDocument"), {
      method: "POST",
      body: form,
      timeoutMs: Math.max(this.requestTimeoutMs, 60000),
      label: "Telegram sendDocument"
    });
    const body = await response.json();
    if (!body.ok) throw new Error(`Telegram sendDocument failed: ${body.description || response.status}`);
  }

  apiUrl(method, params = {}) {
    if (!this.botToken && !this.dryRun) throw new Error("Telegram botToken is required.");
    const url = new URL(`https://api.telegram.org/bot${this.botToken}/${method}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    return url;
  }
}

export function splitTelegramText(text, limit = 3900) {
  const value = String(text || "");
  if (value.length <= limit) return [value];
  const chunks = [];
  for (let i = 0; i < value.length; i += limit) chunks.push(value.slice(i, i + limit));
  return chunks;
}

async function fetchWithTimeout(url, { timeoutMs, label, ...options } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`${label || "Telegram request"} timed out after ${timeoutMs} ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
