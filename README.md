# Codex Telegram Bridge

A local Windows sidecar that lets one allowed Telegram user control an existing Codex Desktop chat.

It mirrors human-facing Codex updates and final answers to Telegram, and it can send Telegram text back into the currently bound Codex chat.

## What It Does

- Polls the Telegram Bot API from your local machine.
- Binds to one Codex Desktop chat at a time.
- Mirrors visible Codex status messages and assistant answers to Telegram.
- Sends Telegram input either through the visible Codex Desktop composer or through `codex exec resume`.
- Avoids forwarding tool logs, command output, hidden reasoning, token events, user messages, and raw rollout bodies.

## Requirements

- Windows.
- Node.js 20 or newer.
- Codex Desktop installed and signed in.
- A Telegram bot token from [@BotFather](https://t.me/BotFather).
- Your numeric Telegram user id.

## Install

```powershell
git clone https://github.com/<owner>/codex-telegram-bridge.git
cd codex-telegram-bridge
npm test
```

No npm dependencies are required.

## Configure

Create:

```powershell
%USERPROFILE%\.codex\telegram-bridge.local.json
```

Example:

```json
{
  "botToken": "123456:telegram-bot-token",
  "allowedUserId": "123456789",
  "pollIntervalMs": 1500,
  "paused": false,
  "dryRun": false,
  "boundThreadId": null,
  "inputMode": "desktop-ui",
  "codexCommand": "codex",
  "codexWindowProcessName": "Codex"
}
```

Keep this file private. It contains your Telegram bot token.

## Run

```powershell
npm start
```

Dry run:

```powershell
npm run dry-run
```

## First Use

1. Start Codex Desktop.
2. Open the chat you want to control.
3. Start the bridge with `npm start`.
4. In Telegram, send `/ping`.
5. Send `/threads` to list recent Codex chats.
6. Send `/bind 1` or `/bind <title>` to bind a chat.
7. Send a normal Telegram message.

In `desktop-ui` mode, keep the target Codex chat visible and idle. If Codex shows a Stop button, the bridge refuses to paste and asks you to wait until the current turn finishes.

## Input Modes

`desktop-ui` is the default. It focuses Codex Desktop, finds the visible composer, pastes your Telegram text, submits it, and verifies the rollout file changed.

`codex-exec` sends text through `codex exec resume <thread-id>`. This is useful for headless execution, but the open desktop window may not live-update.

Switch modes from Telegram:

```text
/mode desktop-ui
/mode codex-exec
```

## Telegram Commands

```text
/help
/ping
/mode
/mode desktop-ui
/mode codex-exec
/threads
/threads example
/current
/bind
/bind 1
/bind <title>
/bind <thread-id-prefix>
/rebind 1
/open 1
/unbind
/pause
/resume
/last
/status
/stop
```

Only the configured `allowedUserId` can control the bridge. Other Telegram senders are ignored.

## Privacy And Safety

- Do not commit `telegram-bridge.local.json`.
- Do not commit audit logs, screenshots, rollout files, or Codex state databases.
- The bridge writes metadata-only audit logs by default.
- Mirrored messages are limited to human-facing status updates and assistant-visible output.
- Raw command output, tool calls, reasoning events, token events, and hidden logs are intentionally filtered out.

## Troubleshooting

- `No Codex thread is bound`: open Codex Desktop, send `/threads`, then `/bind 1`.
- `Codex desktop is still running`: wait until the current Codex turn finishes, then send again.
- `foreground window is ... not Codex`: bring Codex Desktop to the front and retry.
- `rollout file did not change`: the desktop composer did not accept the input; make sure the target chat is visible and idle.
- No Telegram replies: send `/ping`, check that `botToken` and `allowedUserId` are correct, and confirm the bridge process is still running.

## License

MIT
