# itwillsync

Sync any terminal-based coding agent to your phone over local network. Open source, agent-agnostic, zero cloud.

```
npx itwillsync -- claude
npx itwillsync -- aider
npx itwillsync -- bash
```

## How it works

1. Run `itwillsync` with your agent command
2. A QR code appears in your terminal
3. Scan it on your phone — opens a terminal in your browser
4. Control your agent from your phone (or both phone and laptop simultaneously)

All data stays on your local network. No cloud, no relay, no account needed.

## Requirements

- Node.js 20+
- Any terminal-based coding agent (Claude Code, Aider, Goose, Codex, or just `bash`)

## Install & Use

```bash
# Run directly (no install needed)
npx itwillsync -- claude

# Or install globally
npm install -g itwillsync
itwillsync -- aider --model gpt-4
```

## Options

```
--port <number>   Port to listen on (default: 3456)
--localhost        Bind to 127.0.0.1 only (no LAN access)
--no-qr           Don't display QR code
-h, --help        Show help
-v, --version     Show version
```

## Remote Access

By default, itwillsync is accessible on your local network (same WiFi). For remote access from anywhere:

- **Tailscale** (recommended): Install on both devices, access via Tailscale IP
- **WireGuard / VPN**: Any VPN that puts devices on the same network
- **SSH tunnel**: `ssh -L 3456:localhost:3456 your-machine`

## Security

- Each session generates a random 64-character token
- Token is embedded in the QR code URL
- All WebSocket connections require the token
- No data leaves your network

## Architecture

```
Your Machine                          Your Phone
┌─────────────────────┐              ┌──────────────┐
│ itwillsync          │   WiFi/LAN   │  Browser     │
│ ├─ PTY (your agent) │◄────────────►│  xterm.js    │
│ ├─ HTTP server      │  WebSocket   │  terminal    │
│ └─ WS server        │              └──────────────┘
└─────────────────────┘
```

## Session Behavior

- **No timeout**: Sessions live as long as the agent process runs. No TTL, no idle disconnect.
- **Multiple devices**: Connect from phone, tablet, and laptop simultaneously — all see the same terminal.
- **Reconnect**: If your phone disconnects (WiFi switch, screen lock), it auto-reconnects and catches up with recent output.
- **Keepalive**: WebSocket pings every 30s prevent routers from closing idle connections.
- **One session per instance**: Run multiple `itwillsync` instances on different ports for multiple agents.

## Development

```bash
# 1. Clone and enter the project
git clone https://github.com/your-username/itwillsync
cd itwillsync

# 2. Use Node 22 (required for node-pty native bindings)
nvm use  # reads .nvmrc

# 3. Install dependencies
pnpm install

# 4. Build everything (web client first, then CLI)
pnpm build

# 5. Test it
node packages/cli/dist/index.js -- bash
```

### Project Structure

```
packages/
├── cli/           # Main npm package — PTY, server, auth, CLI
└── web-client/    # Browser terminal — xterm.js, mobile-friendly CSS
```

### Contributing

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Run `pnpm build` to verify
5. Open a PR

## Roadmap

- [ ] Chat-style input bar + quick action buttons on mobile
- [ ] Agent detection + structured view for Claude Code
- [ ] React Native mobile app
- [ ] VS Code extension adapter
- [ ] Agent Sync Protocol specification

## License

MIT
