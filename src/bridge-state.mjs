export class BridgeState {
  constructor({ paused = false, boundThread = null } = {}) {
    this.paused = paused;
    this.boundThread = boundThread;
    this.lastCandidate = null;
    this.lastAssistantText = null;
    this.lastStatusText = null;
    this.lastError = null;
    this.clipboardRestoreFailed = false;
    this.lastThreadList = [];
    this.lastFileList = [];
  }

  bind(thread) {
    this.boundThread = normalizeThread(thread);
    this.lastCandidate = this.boundThread;
  }

  rebind(thread) {
    this.bind(thread);
  }

  unbind() {
    this.boundThread = null;
  }

  noteCandidate(thread) {
    this.lastCandidate = normalizeThread(thread);
  }

  noteThreadList(threads) {
    this.lastThreadList = [...threads];
  }

  noteFileList(files) {
    this.lastFileList = [...files];
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
  }

  stop() {
    this.pause();
  }

  canExecuteInput() {
    return Boolean(this.boundThread && !this.paused);
  }

  noteForwarded(event) {
    if (event.kind === "assistant") this.lastAssistantText = event.text;
    if (event.kind === "status") this.lastStatusText = event.text;
  }

  status() {
    return {
      paused: this.paused,
      boundThread: this.boundThread,
      lastCandidate: this.lastCandidate,
      lastError: this.lastError,
      clipboardRestoreFailed: this.clipboardRestoreFailed
    };
  }
}

function normalizeThread(thread) {
  if (!thread?.id || !thread?.rolloutPath) {
    throw new Error("Cannot bind without thread id and rollout path.");
  }
  return {
    id: String(thread.id),
    title: String(thread.title || "Untitled Codex thread"),
    rolloutPath: String(thread.rolloutPath),
    source: thread.source ? String(thread.source) : "",
    cwd: thread.cwd ? String(thread.cwd) : "",
    updatedAtMs: Number(thread.updatedAtMs || 0)
  };
}
