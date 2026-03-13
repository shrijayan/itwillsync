<div align="center">

# itwillsync

**Control your AI coding agents from anywhere.**

[![npm version](https://img.shields.io/npm/v/itwillsync)](https://www.npmjs.com/package/itwillsync)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm downloads](https://img.shields.io/npm/dm/itwillsync)](https://www.npmjs.com/package/itwillsync)
[![CI](https://github.com/shrijayan/itwillsync/actions/workflows/ci.yml/badge.svg)](https://github.com/shrijayan/itwillsync/actions/workflows/ci.yml)

Sync any coding agent to your phone — one dashboard for all your sessions. Agent-agnostic, privacy-first, zero cloud.

[Website](https://shrijayan.github.io/itwillsync/) | [Docs](https://shrijayan.github.io/itwillsync/docs/) | [Demo Video](https://youtu.be/Zc0Tb98CXh0)

<!-- TODO: Replace with demo GIF once recorded -->
<!-- <img src="docs/assets/demo.gif" alt="itwillsync demo" width="700"> -->

</div>

---

## Quick Start

```bash
npx itwillsync claude        # Claude Code
npx itwillsync aider         # Aider
npx itwillsync bash          # or any terminal command
```

No install needed. Node.js 20+ required.

## How It Works

```
┌─────────────────┐                           ┌─────────────────┐
│   Your Laptop   │  Local WiFi / Tailscale   │   Your Phone    │
│                 │                           │                 │
│  Agent (Claude, │    WebSocket + Auth       │  Browser-based  │
│  Aider, etc.)   │  ◄═════════════════════►  │  Terminal       │
│       ↕         │    Token in QR code       │  (xterm.js)     │
│  PTY (node-pty) │                           │  Touch keyboard │
│       ↕         │                           │  Extra keys bar │
│  HTTP + WS      │                           │                 │
│  Server         │                           │                 │
└─────────────────┘                           └─────────────────┘
```

1. Run `itwillsync` with your agent command
2. A QR code appears in your terminal
3. Scan it on your phone — a terminal opens in your browser
4. Control your agent from your phone, laptop, or both simultaneously

## When To Use It

- **Walking to the kitchen** while Claude works on a long refactor — check progress from your phone
- **Monitoring multiple agents** from the couch via the multi-session dashboard
- **Getting a notification** when your agent needs attention (auto-detects BEL/OSC signals)
- **Working from a coffee shop** via Tailscale — no need to be on the same WiFi
- **Showing a colleague** what your AI agents are doing — just share the QR code
- **Quick approval** from your phone while you're in a meeting

## Multi-Session Dashboard

Running multiple agents? The hub daemon manages all your sessions from one place.

```
┌─────────────────────────────────────┐
│  itwillsync Dashboard               │
│                                     │
│  ┌─────────────┐ ┌─────────────┐    │
│  │ Claude Code │ │ Aider       │    │
│  │ ~/myproject │ │ ~/api       │    │ 
│  │ ● Active    │ │ ⚠ Attention │    │
│  │ 12m uptime  │ │ 3m uptime   │    │
│  └─────────────┘ └─────────────┘    │
│                                     │
│  ┌─────────────┐                    │
│  │ Bash        │                    │
│  │ ~/scripts   │                    │
│  │ ○ Idle      │                    │
│  │ 45m uptime  │                    │
│  └─────────────┘                    │
└─────────────────────────────────────┘
```

- Session cards show agent name, working directory, status, and uptime
- Real-time updates via WebSocket
- Tap a card to open the full terminal
- Attention detection alerts you when an agent needs input
- Sleep prevention keeps your machine awake during long tasks

## Works With

Claude Code, Aider, Goose, Codex, Cline, Copilot CLI — or any terminal-based tool.

```bash
npx itwillsync claude          # Claude Code
npx itwillsync aider           # Aider
npx itwillsync goose            # Goose
npx itwillsync "codex --quiet"  # Codex
npx itwillsync bash             # Plain shell
```

If it runs in a terminal, itwillsync can sync it.

## Connection Modes

| Mode | Command | When |
|------|---------|------|
| **Local WiFi** (default) | `npx itwillsync claude` | Phone on same network |
| **Tailscale** | `npx itwillsync --tailscale claude` | Any network, anywhere |
| **Cloudflare Tunnel** | `npx itwillsync --tunnel cloudflare claude` | Remote, no VPN needed |
| **Localhost** | `npx itwillsync --localhost claude` | Same machine only |

On first run, a setup wizard detects your network and saves your preference.

```bash
# First run — wizard auto-detects Tailscale
npx itwillsync claude

# Override for a single session
npx itwillsync --tailscale claude
npx itwillsync --local claude

# Re-run the setup wizard
npx itwillsync setup
```

## Commands

| Flag | Description |
|------|-------------|
| `--port <number>` | Port to listen on (default: 3456) |
| `--localhost` | Bind to 127.0.0.1 only |
| `--tailscale` | Use Tailscale for this session |
| `--local` | Use local WiFi for this session |
| `--tunnel <provider>` | Use a tunnel for remote access (cloudflare) |
| `--no-qr` | Don't display QR code |
| `setup` | Run the setup wizard |
| `-h, --help` | Show help |
| `-v, --version` | Show version |

## Security

- **E2E encrypted** — all WebSocket messages encrypted with NaCl secretbox (XSalsa20-Poly1305)
- **Random tokens** — each session generates a cryptographically random 64-character token
- **QR code auth** — token is embedded in the QR code URL, no manual entry needed
- **WebSocket auth** — all connections require the token (constant-time comparison)
- **Rate limiting** — 5 failed auth attempts locks out the IP for 60 seconds
- **Zero cloud** — no data leaves your local network (or Tailscale tailnet)
- **No accounts** — no signup, no telemetry, no tracking

## Mobile-Optimized

The phone terminal isn't just a mirror — it's built for mobile:

- **Touch-friendly extra keys bar** — Ctrl, Alt, Tab, Escape, arrows, and function keys
- **WebGL-accelerated rendering** on desktop, canvas fallback on mobile
- **Auto-reconnect** with scrollback buffer sync if connection drops
- **Audio notifications** when agents need attention

## Development

```bash
git clone https://github.com/shrijayan/itwillsync.git
cd itwillsync
nvm use                          # Node 22
pnpm install
pnpm build                       # Build all packages
pnpm test                        # Run tests
```

Monorepo structure:

```
packages/
├── cli/           → Main npm package (itwillsync)
├── web-client/    → Browser terminal (xterm.js)
├── hub/           → Dashboard daemon
├── landing/       → Landing page
└── docs/          → VitePress documentation
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and PR guidelines.

## License

[MIT](LICENSE)
