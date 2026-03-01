# Introduction

itwillsync lets you control any terminal-based coding agent from your phone. It wraps your agent in a pseudo-terminal (PTY), starts a local server, and serves a web-based terminal to your phone over your local network or Tailscale.

## How It Works

1. Run `itwillsync` with your agent command
2. A QR code appears in your terminal
3. Scan it on your phone — a terminal opens in your browser
4. Control your agent from your phone (or both phone and laptop simultaneously)

## Multi-Session Dashboard

When you run multiple agents, itwillsync automatically starts a hub daemon that serves a dashboard on your phone. The dashboard shows all active sessions with live terminal previews. Tap any session to open the full terminal.

## Supported Agents

itwillsync works with any terminal-based tool:

- **Claude Code** — `itwillsync -- claude`
- **Aider** — `itwillsync -- aider`
- **Goose** — `itwillsync -- goose`
- **Codex** — `itwillsync -- codex`
- **Copilot CLI** — `itwillsync -- gh copilot`
- **Any shell** — `itwillsync -- bash`

## Privacy

All communication stays on your local network (or Tailscale VPN). No data is sent to any cloud service. No accounts, no telemetry, no tracking.
