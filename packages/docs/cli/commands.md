# Commands & Flags

## Usage

```bash
itwillsync [options] -- <command> [args...]
itwillsync [options] <command> [args...]
itwillsync setup
itwillsync hub [info|stop|status]
```

## Subcommands

### `setup`

Run the interactive setup wizard to configure your networking mode (local WiFi or Tailscale).

```bash
itwillsync setup
```

Your choice is saved to `~/.itwillsync/config.json` and used for all future sessions.

### `hub info`

Show the dashboard QR code, full URL with token, and list active sessions. Use this when you need to re-scan the QR code or copy the dashboard URL.

```bash
itwillsync hub info
```

### `hub stop`

Stop the hub daemon and all connected sessions.

```bash
itwillsync hub stop
```

### `hub status`

List all active sessions with their status, uptime, and port.

```bash
itwillsync hub status
```

## Session Options

These flags control how a session runs.

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--port <number>` | number | 7964 | Port for the session's HTTP/WebSocket server |
| `--localhost` | boolean | false | Bind to 127.0.0.1 only (disables LAN access) |
| `--tailscale` | boolean | false | Use Tailscale IP for this session |
| `--local` | boolean | false | Use local WiFi IP for this session |
| `--no-qr` | boolean | false | Don't display the QR code |

### Examples

```bash
# Start Claude Code agent
itwillsync -- claude

# Start Aider with specific model
itwillsync -- aider --model gpt-4

# Use a custom port
itwillsync --port 8080 -- claude

# Tailscale mode for remote access
itwillsync --tailscale -- claude

# Localhost only (testing/debugging)
itwillsync --localhost -- bash
```

## Hub Management Flags

These flags can be used instead of the `hub` subcommand.

| Flag | Equivalent | Description |
|------|------------|-------------|
| `--hub-info` | `hub info` | Show dashboard URL, QR code, and hub status |
| `--hub-stop` | `hub stop` | Stop the hub daemon and all sessions |
| `--hub-status` | `hub status` | List all active sessions |

### Examples

```bash
itwillsync --hub-info      # same as: itwillsync hub info
itwillsync --hub-stop      # same as: itwillsync hub stop
itwillsync --hub-status    # same as: itwillsync hub status
```

## General Flags

| Flag | Description |
|------|-------------|
| `-h, --help` | Show help text |
| `-v, --version` | Show version number |

## The `--` Separator

The `--` separator tells itwillsync where its flags end and the agent command begins. This is important when your agent has its own flags:

```bash
# Without separator — works for simple commands
itwillsync bash

# With separator — needed when agent has its own flags
itwillsync -- aider --model gpt-4

# itwillsync flags BEFORE the separator
itwillsync --tailscale --port 9000 -- claude
```

::: warning
Don't confuse `-- hub-stop` (runs `hub-stop` as a command) with `--hub-stop` (stops the hub) or `hub stop` (subcommand).
:::
