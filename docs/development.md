# Development Guide

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

The CLI wraps your agent in a PTY (via node-pty), starts an HTTP + WebSocket server, and serves a web terminal (xterm.js) to your phone. Auth uses a random 64-char hex token per session, embedded in the QR code URL.

## Project Structure

```
packages/
├── cli/           # Main npm package — PTY, server, auth, CLI
│   └── src/
│       ├── index.ts         # Entry point, main flow
│       ├── cli-options.ts   # Argument parsing, help text
│       ├── config.ts        # Config persistence (~/.itwillsync/config.json)
│       ├── tailscale.ts     # Tailscale detection
│       ├── wizard.ts        # Interactive setup wizard (@clack/prompts)
│       ├── server.ts        # HTTP + WebSocket server
│       ├── network.ts       # IP resolution, port finding
│       ├── pty-manager.ts   # PTY wrapping (node-pty)
│       ├── auth.ts          # Token generation
│       ├── qr.ts            # QR code display
│       └── __tests__/       # Vitest test files
├── web-client/    # Browser terminal — xterm.js, mobile-friendly CSS
└── landing/       # Website — shrijayan.github.io/itwillsync
```

## Setup

```bash
# 1. Clone and enter the project
git clone https://github.com/shrijayan/itwillsync
cd itwillsync

# 2. Use Node 22 (required for node-pty native bindings)
nvm use  # reads .nvmrc

# 3. Install dependencies
pnpm install

# 4. Run tests
pnpm test

# 5. Build everything (web client first, then CLI)
pnpm build

# 6. Test it
node packages/cli/dist/index.js -- bash
```

## Build Order

Web client must build **before** CLI (CLI embeds the web client dist).

```bash
pnpm build                                        # Build everything (correct order)
pnpm --filter @itwillsync/web-client build        # Build web client only
pnpm --filter itwillsync build                    # Build CLI only
```

## Testing

```bash
pnpm test                        # Run all tests
pnpm --filter itwillsync test    # Run CLI tests only
```

Tests use Vitest. Test files are in `packages/cli/src/__tests__/`:
- `config.test.ts` — config persistence (uses temp dirs)
- `tailscale.test.ts` — Tailscale detection (mocks child_process)
- `parse-args.test.ts` — CLI argument parsing (pure function tests)
- `resolve-ip.test.ts` — IP resolution logic (mocks tailscale module)

## Key Technical Notes

- **node-pty**: `spawn-helper` binary needs execute permissions — handled at PTY init time
- **tsup config**: node-pty and qrcode-terminal are external (native/legacy). ws and @clack/prompts are bundled.
- **Config location**: `~/.itwillsync/config.json`. Override with `ITWILLSYNC_CONFIG_DIR` env var (used by tests).

## Session Behavior

- **No timeout**: Sessions live as long as the agent process runs
- **Multiple devices**: Connect from phone, tablet, and laptop simultaneously
- **Reconnect**: Auto-reconnects and catches up with recent output (50KB scrollback buffer)
- **Keepalive**: WebSocket pings every 30s prevent routers from closing idle connections

## Contributing

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Run `pnpm test && pnpm build` to verify
5. Open a PR