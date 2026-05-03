export const HELP_TEXT = `Telegram Codex bridge commands:

/help - show this command list
/ping - test the bridge without sending input to Codex
/mode - show input mode
/mode desktop-ui - paste Telegram input into the visible Codex desktop window
/mode codex-exec - run Telegram input through codex exec resume
/status - show bridge state and errors
/threads - list recent Codex desktop chats
/threads example - search chats
/current - show bound chat
/bind - bind newest chat
/bind 1 - bind by list number
/bind Example desktop chat - bind by title
/bind 11111111 - bind by id prefix
/rebind 1 - switch bound chat
/open Example desktop chat - open chat in Codex desktop and bind it
/open 1 - open by list number and bind it
/unbind - clear binding
/pause - pause Telegram input
/resume - resume Telegram input
/last - resend latest Codex message
/stop - pause input without killing bridge

Input mode defaults to desktop-ui so Telegram text appears in the visible Codex desktop chat.
codex-exec mode is available for headless execution, but the desktop window may not live-update.`;
