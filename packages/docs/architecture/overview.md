# How It Works

## Data Flow

```
Your Machine                              Your Phone
┌──────────────────────────────────┐     ┌──────────────────┐
│                                  │     │                  │
│  HUB DAEMON (:7962)             │     │  Dashboard       │
│  ├─ Dashboard server            │◄───►│  (session list)  │
│  ├─ Session registry            │ WS  │                  │
│  └─ Preview collector           │     └──────────────────┘
│                                  │
│  SESSION 1 (:7964)              │     ┌──────────────────┐
│  ├─ PTY (your agent)            │◄───►│  Terminal         │
│  ├─ HTTP server                 │ WS  │  (xterm.js)      │
│  └─ WebSocket server            │     └──────────────────┘
│                                  │
│  SESSION 2 (:7965)              │
│  ├─ PTY (another agent)         │
│  └─ ...                         │
└──────────────────────────────────┘
```

## Project Structure

itwillsync is a pnpm monorepo with these packages:

```
packages/
├── cli/           Main npm package (itwillsync)
│   └── src/
│       ├── index.ts         Entry point, session lifecycle
│       ├── cli-options.ts   Argument parsing
│       ├── hub-client.ts    Hub discovery and registration
│       ├── server.ts        HTTP + WebSocket server
│       ├── pty-manager.ts   PTY wrapping (node-pty)
│       ├── auth.ts          Token generation + validation
│       ├── network.ts       IP resolution, port finding
│       ├── qr.ts            QR code display
│       ├── config.ts        Config persistence
│       ├── tailscale.ts     Tailscale detection
│       └── wizard.ts        Setup wizard
├── hub/           Hub daemon + dashboard
│   └── src/
│       ├── daemon.ts           Hub process lifecycle
│       ├── registry.ts         Session registry
│       ├── internal-api.ts     Localhost REST API
│       ├── server.ts           Dashboard server
│       ├── preview-collector.ts  Live preview data
│       ├── auth.ts             Token + rate limiting
│       └── dashboard/          Web UI (vanilla TS)
├── web-client/    Browser terminal (xterm.js)
├── landing/       Marketing website
└── docs/          This documentation (VitePress)
```

## Build Order

The packages must build in this order because each embeds the previous:

1. **web-client** (Vite) — builds xterm.js terminal UI
2. **hub** (Vite + tsup) — builds dashboard UI + hub daemon, embeds dashboard
3. **cli** (tsup) — builds CLI, embeds web-client + hub

The root `pnpm build` handles this automatically.

## Key Technologies

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 22+ |
| Language | TypeScript (ESM) |
| Build (CLI) | tsup |
| Build (web) | Vite |
| Terminal emulation | node-pty |
| Browser terminal | xterm.js |
| WebSocket | ws (server), native WebSocket (client) |
| Package manager | pnpm (workspace monorepo) |
