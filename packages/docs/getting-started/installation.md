# Installation

## Requirements

- **Node.js 20+** (Node 22 recommended for best compatibility with native modules)
- A terminal-based coding agent (Claude Code, Aider, etc.) or just `bash`

## Quick Run (No Install)

The fastest way to try itwillsync — no global install needed:

```bash
npx itwillsync -- claude
```

## Global Install

For regular use, install globally:

```bash
npm install -g itwillsync
```

Then run directly:

```bash
itwillsync -- claude
itwillsync -- aider --model gpt-4
itwillsync bash
```

## Node Version

itwillsync uses [node-pty](https://github.com/nicktaf/node-pty) for terminal emulation, which requires native bindings. Node 22 is recommended. If you use [nvm](https://github.com/nvm-sh/nvm), the project includes an `.nvmrc` file:

```bash
nvm use  # switches to Node 22
```

## First Run

On first run, a setup wizard asks how you want to connect:

- **Local WiFi** — Your phone and computer must be on the same network
- **Tailscale** — Connect from anywhere via Tailscale VPN

Your choice is saved for future sessions. You can change it anytime with:

```bash
itwillsync setup
```
