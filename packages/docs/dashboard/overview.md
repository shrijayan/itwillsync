# Dashboard Overview

When you run multiple coding agents with itwillsync, a hub daemon automatically starts and serves a dashboard on your phone. The dashboard shows all active sessions with live terminal previews.

## How It Works

1. You run `itwillsync -- claude` — the hub daemon auto-spawns in the background
2. A QR code appears pointing to the dashboard URL
3. You run `itwillsync -- aider` in another terminal — it registers with the hub
4. Your phone's dashboard shows both sessions in real-time

## Hub Daemon

The hub is a lightweight background process that:
- Serves the dashboard web UI on port **7962** (SYNC on a phone keypad)
- Manages a session registry (tracks all active sessions)
- Collects live terminal previews from each session
- Broadcasts updates to all connected dashboard clients

The hub auto-spawns when you start your first session and auto-shuts down 30 seconds after the last session disconnects.

## Dashboard UI

The dashboard is a mobile-first web app showing:
- **Session cards** — one per running agent
- **Live preview** — last few lines of terminal output per session
- **Status indicators** — active (green), idle (yellow), needs attention (red)
- **Action buttons** — Open, Rename, Info, Stop

Tap a session card's "Open" button to open the full terminal in a new tab.

## Ports

| Port | Purpose |
|------|---------|
| 7962 | Dashboard (external, accessible from phone) |
| 7963 | Internal API (localhost only, session registration) |
| 7964+ | Individual session servers (one per agent) |

Port 7962 spells "SYNC" on a phone keypad.
