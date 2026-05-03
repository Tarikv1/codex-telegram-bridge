import { open } from "node:fs/promises";
import { parseRolloutLine, shouldForwardEvent } from "./rollout-parser.mjs";

export class RolloutTail {
  constructor({ threadId, rolloutPath, deduper, onEvent, startAtEnd = true }) {
    this.threadId = threadId;
    this.rolloutPath = rolloutPath;
    this.deduper = deduper;
    this.onEvent = onEvent;
    this.offset = 0;
    this.partial = "";
    this.startAtEnd = startAtEnd;
  }

  async initialize() {
    const file = await open(this.rolloutPath, "r");
    try {
      const stat = await file.stat();
      this.offset = this.startAtEnd ? stat.size : 0;
    } finally {
      await file.close();
    }
  }

  async poll() {
    const file = await open(this.rolloutPath, "r");
    try {
      const stat = await file.stat();
      if (stat.size < this.offset) {
        this.offset = 0;
        this.partial = "";
      }
      if (stat.size === this.offset) return;

      const length = stat.size - this.offset;
      const buffer = Buffer.alloc(length);
      await file.read(buffer, 0, length, this.offset);
      this.offset = stat.size;

      const text = this.partial + buffer.toString("utf8");
      const lines = text.split(/\r?\n/);
      this.partial = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        const event = parseRolloutLine(line);
        if (!shouldForwardEvent(event)) continue;
        if (this.deduper && !this.deduper.shouldSend(this.threadId, event)) continue;
        await this.onEvent(event);
      }
    } finally {
      await file.close();
    }
  }
}
