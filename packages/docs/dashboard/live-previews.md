# Live Previews

Each session card in the dashboard shows a live text preview of the terminal output — the last few lines of what the agent is doing.

## How It Works

1. The hub daemon connects to each session's WebSocket server as a read-only client
2. It receives the same terminal output stream that the phone terminal sees
3. ANSI escape codes (colors, cursor movement) are stripped to produce plain text
4. The last 5 lines are kept in a buffer per session
5. Updates are broadcast to dashboard clients at most once every 500ms per session

## What You See

The preview area shows the most recent terminal output as plain monospace text. For example:

```
> Building project...
  42 files compiled
  0 errors, 2 warnings
  Done in 3.2s
$ _
```

Lines longer than 80 characters are truncated with `...`.

## Throttling

To save phone bandwidth, preview updates are throttled to 2 per second per session. Even if an agent produces rapid output (like a build log), the dashboard stays responsive.

## Reconnection

If a session's WebSocket connection drops (e.g., the session restarted), the hub automatically reconnects with exponential backoff (1s, 1.5s, 2.25s, up to 10s max).

## Technical Details

ANSI stripping removes:
- CSI sequences (colors, formatting): `ESC[...m`
- OSC sequences (title changes): `ESC]...BEL`
- Cursor movement and screen clearing commands
- Carriage returns (`\r`)
