# Configuration

itwillsync stores configuration in `~/.itwillsync/`.

## Config File

**Path**: `~/.itwillsync/config.json`

Created by the setup wizard on first run. Contains your networking preference:

```json
{
  "networkingMode": "local"
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

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ITWILLSYNC_CONFIG_DIR` | `~/.itwillsync` | Override the config directory path |

This is primarily used in tests to isolate config from the user's home directory.
