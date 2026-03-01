# Managing Sessions

Each session in the dashboard has an action bar with four buttons.

## Open

Opens the full terminal view in a new browser tab. This is the same xterm.js terminal as the original single-session mode — full color, cursor, scrollback, and mobile keyboard support.

## Rename

Tap "Rename" to edit the session's display name inline. Type a new name and press Enter (or tap elsewhere) to save. Press Escape to cancel.

By default, sessions are named after their agent command (`claude`, `aider`, `bash`). Renaming is useful when running multiple instances of the same agent on different projects.

## Info

Tap "Info" to toggle the metadata panel showing:

| Field | Description |
|-------|-------------|
| PID | Process ID of the agent |
| Agent | The command that was run |
| Port | The session's WebSocket server port |
| Directory | Working directory |
| Memory | Resident memory usage (from `ps`) |
| Uptime | How long the session has been running |

Tap "Info" again to collapse the panel.

## Stop

Tap "Stop" to terminate a session. A confirmation dialog appears: "Stop this session?" with Yes/No buttons. Confirming sends SIGTERM to the agent process.

The session is removed from the dashboard. Other sessions are unaffected.

## Session Status

Each session card shows a status indicator:

| Status | Color | Meaning |
|--------|-------|---------|
| active | Green | Output received in the last 30 seconds |
| idle | Yellow | No output for 30+ seconds |
| attention | Red (pulsing) | Agent sent a notification signal (bell) |
