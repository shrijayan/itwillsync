---
description: "Configure itwillsync: network mode, ports, Tailscale, and persistent settings in ~/.itwillsync/config.json."
---

# Configuration

itwillsync stores configuration in `~/.itwillsync/`.

## Config File

**Path**: `~/.itwillsync/config.json`

Created by the setup wizard on first run. Contains your networking preference and session defaults:

```json
{
  "networkingMode": "local",
  "scrollbackBufferSize": 10485760,
  "maxSessions": 20,
  "idleTimeoutMs": 86400000,
  "logRetentionDays": 30,
  "clientBufferLimit": 262144,
  "maxTerminalCols": 500,
  "maxTerminalRows": 200
}
```

### Networking Modes

| Mode | Value | Description |
|------|-------|-------------|
| Local WiFi | `"local"` | Uses your LAN IP (e.g., 192.168.1.x). Phone must be on same WiFi. |
| Tailscale | `"tailscale"` | Uses your Tailscale IP (100.x.x.x). Connect from anywhere. |

Change the mode with:

```bash
itwillsync setup          # Interactive wizard
itwillsync --tailscale    # Override for one session
itwillsync --local        # Override for one session
```

### Session Options

| Option | Default | Description |
|--------|---------|-------------|
| `scrollbackBufferSize` | `10485760` (10 MB) | Terminal scrollback buffer size in bytes |
| `maxSessions` | `20` | Maximum concurrent sessions |
| `idleTimeoutMs` | `86400000` (24 hours) | Session idle timeout before auto-cleanup |
| `logRetentionDays` | `30` | How long to keep session logs |
| `clientBufferLimit` | `262144` (256 KB) | Per-client WebSocket message buffer |
| `maxTerminalCols` | `500` | Maximum PTY columns (resize requests clamped to this) |
| `maxTerminalRows` | `200` | Maximum PTY rows (resize requests clamped to this) |

All options are optional — defaults apply if omitted.

## Hub Files

When the hub daemon is running, it creates two additional files:

### `~/.itwillsync/hub.json`

Contains the hub's connection info:

```json
{
  "masterToken": "64-char-hex-string",
  "externalPort": 7962,
  "internalPort": 7963,
  "pid": 12345,
  "startedAt": 1709337600000
}
```

This file is read by new sessions to discover the hub and obtain the master token.

### `~/.itwillsync/hub.pid`

Contains the hub daemon's process ID. Used by `hub stop` to send SIGTERM.

Both files are cleaned up when the hub shuts down normally. If the hub crashes, you may need to delete them manually (see [Hub Management > Troubleshooting](/cli/hub#troubleshooting)).

### `~/.itwillsync/sessions.json`

Persists the session registry to disk. When the hub restarts, it restores sessions that are still alive (verified by checking if the process PID exists). Sessions older than 24 hours are automatically pruned.

### `~/.itwillsync/tool-history.json`

Tracks the 20 most recently used agent commands (e.g., `claude`, `aider`, `bash`). Used by the dashboard for quick-access suggestions. Sorted by most-recently-used.

### `~/.itwillsync/logs/`

Directory containing session logs. Each session's terminal output is logged to `{sessionId}.log` during the session and auto-compressed to `.gz` on session end. Logs older than `logRetentionDays` (default: 30) are cleaned up.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ITWILLSYNC_CONFIG_DIR` | `~/.itwillsync` | Override the config directory path |

This is primarily used in tests to isolate config from the user's home directory.
