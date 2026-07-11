---
description: "Install itwillsync via npx or npm. Requires Node.js 20+. Works on macOS, Linux, and Windows."
---

# Installation

## Requirements

- **Node.js 20+** (20 and 22 are both tested in CI; Node 24 hasn't been validated yet)
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

itwillsync uses [node-pty](https://github.com/microsoft/node-pty) for terminal emulation, which
requires native bindings. Its prebuilt binaries are N-API based (ABI-stable across Node major
versions), so **Node 20+ works** — CI tests both Node 20 and 22 on every change. Node 24 just
hasn't been added to that test matrix yet, not a known incompatibility. If you use
[nvm](https://github.com/nvm-sh/nvm), the project includes an `.nvmrc` file pinned to the version
this repo is developed against:

```bash
nvm use  # switches to the project's default dev version
```

## First Run

On first run, a setup wizard asks how you want to connect your phone:

```
◆ How do you want to connect your phone?
│ ○ Local Network — Phone and computer on the same WiFi
│ ○ Tailscale — Connect from anywhere via Tailscale VPN
└
```

### If you choose Local WiFi

Your config is saved — you're done. Next time you run itwillsync, a QR code appears and your phone connects over your local network.

### If you choose Tailscale

The wizard checks whether Tailscale is installed and running:

- **Not installed** — Shows install instructions for your platform (e.g. `brew install --cask tailscale` on macOS) and asks if you'd like to save Tailscale as your default anyway. You can install it later.
- **Installed but not connected** — Shows a hint to run `tailscale up` or start the Tailscale app. Asks if you'd like to save Tailscale as your default anyway.
- **Installed and connected** — Shows your Tailscale IP and hostname. Config is saved automatically.

For detailed Tailscale installation steps on each platform, see [Tailscale Setup](/getting-started/tailscale).

### Config

Your choice is saved to `~/.itwillsync/config.json`. You can change it anytime by re-running the wizard:

```bash
itwillsync setup
```

Or override per-session with flags:

```bash
itwillsync --tailscale -- claude   # Use Tailscale for this session
itwillsync --local -- claude       # Use local WiFi for this session
```
