# FAQ

## General

### What is itwillsync?

itwillsync is an open-source CLI tool that syncs any terminal-based coding agent (Claude Code, Aider, Goose, Codex, or any terminal command) to your phone over your local network or Tailscale. It wraps your agent in a PTY, starts a local WebSocket server, and serves a browser-based terminal accessible via QR code.

### Is it free?

Yes. itwillsync is open source and MIT licensed. No accounts, no subscriptions, no cloud services.

### Which agents does it work with?

Any terminal-based tool. If you can run it in a terminal, itwillsync can sync it:

- Claude Code (`itwillsync claude`)
- Aider (`itwillsync aider`)
- Goose (`itwillsync goose`)
- Codex (`itwillsync "codex --quiet"`)
- Cline, Copilot CLI, or just `bash`

### What platforms are supported?

- **Computer**: macOS, Windows, Linux
- **Phone**: Any device with a modern web browser (Safari, Chrome, Firefox)
- **Node.js**: Version 20 or higher

---

## Connection & Networking

### How does my phone connect?

Your phone connects over your local WiFi network (default), Tailscale, or a Cloudflare tunnel. When you run `itwillsync`, a QR code appears in your terminal. Scan it on your phone — it opens a browser-based terminal with the auth token embedded in the URL.

### What if my phone is on a different WiFi network?

Use Tailscale or Cloudflare tunnel:

- **Tailscale**: Install Tailscale on both your computer and phone. Run `itwillsync --tailscale claude`. Works from any network.
- **Cloudflare Tunnel**: Run `itwillsync --tunnel cloudflare claude`. Creates a temporary public URL (requires `cloudflared` installed).

### What happens if the WiFi drops?

The web client automatically reconnects with exponential backoff. On reconnection, the server sends a delta of any missed terminal output using the scrollback buffer sync protocol. If the connection is down for more than 15 seconds, the client shows a "session ended" overlay.

### Can multiple phones connect to the same session?

Yes. Multiple devices can connect simultaneously. All connected clients see the same terminal output in real time. Input from any client is forwarded to the agent.

### What ports does it use?

- Session servers start at port 7964 (or use `--port` to specify)
- Hub dashboard runs on port 7962
- Hub internal API runs on port 7963 (localhost only)

---

## Security

### How secure is it?

itwillsync uses multiple layers of security:

1. **E2E Encryption**: All WebSocket messages are encrypted with NaCl secretbox (XSalsa20-Poly1305). The encryption key is derived from the session token using SHA-512.
2. **Random tokens**: Each session generates a cryptographically random 64-character hex token (32 bytes of entropy).
3. **Token-based auth**: Every WebSocket connection must provide the valid token. Tokens are compared using constant-time comparison to prevent timing attacks.
4. **Rate limiting**: 5 failed authentication attempts from the same IP triggers a 60-second lockout.
5. **No cloud**: No data ever leaves your local network (or Tailscale tailnet). There are no third-party servers, no analytics, no telemetry.

### Does the QR code contain sensitive information?

The QR code encodes the full session URL including the auth token. This is how your phone authenticates — no manual token entry needed. Only show the QR code to people you trust.

### Can someone intercept my terminal data?

On a local network, data travels directly between your computer and phone. With E2E encryption enabled, even if someone captures the packets, the data is encrypted with NaCl secretbox. When using Cloudflare tunnel, the data passes through Cloudflare's infrastructure but is encrypted end-to-end.

---

## Dashboard

### What is the dashboard?

When you run multiple agents, itwillsync automatically starts a hub daemon that serves a mobile-first dashboard. It shows all your active sessions as cards with agent name, working directory, status, and uptime. Tap a card to open its full terminal.

### How does attention detection work?

itwillsync monitors terminal output for standard notification escape sequences:
- Standalone BEL (`\x07`)
- OSC 9 (iTerm2 notifications, excluding progress bars)
- OSC 99 (Kitty notifications)
- OSC 777 (Ghostty notifications)

When detected, the session card changes to "Attention" status and your phone plays an audio notification.

### What is sleep prevention?

Long-running agents can be interrupted if your computer goes to sleep. The dashboard includes a setting to prevent idle sleep:
- **macOS**: Uses `caffeinate`
- **Linux**: Uses `systemd-inhibit`
- **Windows**: Uses `powercfg`

---

## Troubleshooting

### QR code shows but phone can't connect

1. Make sure your phone and computer are on the same WiFi network
2. Check that no firewall is blocking the port (default: 7962 for dashboard, 7964+ for sessions)
3. Try `itwillsync --localhost` to verify the server works, then switch back
4. If on different networks, use `--tailscale` or `--tunnel cloudflare`

### Agent not found

If you get "Could not start [agent]":
1. Make sure the agent is installed globally or in your PATH
2. Try running the agent directly: `claude --version` or `aider --version`
3. On Windows, itwillsync resolves the full path using `where.exe` — ensure the agent's `.cmd` shim is on your PATH

### Hub daemon issues

- `itwillsync hub status` — check if the hub is running and list sessions
- `itwillsync hub stop` — stop the hub and all sessions
- `itwillsync hub info` — show dashboard URL and QR code

The hub auto-shuts down 30 seconds after the last session ends. Config is stored in `~/.itwillsync/`.
