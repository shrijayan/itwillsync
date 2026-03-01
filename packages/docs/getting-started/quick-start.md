# Quick Start

## Start a Session

Run itwillsync with your agent:

```bash
itwillsync -- claude
```

A QR code appears in your terminal along with the dashboard URL.

## Connect Your Phone

1. Scan the QR code with your phone camera
2. The dashboard opens in your browser
3. Tap a session card to open the full terminal
4. Type, scroll, and interact with your agent from your phone

## Multiple Sessions

Open another terminal and start a second agent:

```bash
itwillsync -- aider
```

The second session automatically registers with the hub. Your phone's dashboard updates in real-time to show both sessions.

## Retrieve the Dashboard URL

If you need the QR code or URL again:

```bash
itwillsync hub info
```

This shows the QR code, full dashboard URL with token, and lists active sessions.

## Check Active Sessions

```bash
itwillsync hub status
```

Output:
```
Hub is running. 2 active session(s).

  claude  (active, 23m, port 7964)
  aider   (idle, 5m, port 7965)
```

## Stop the Hub

When you're done, stop the hub daemon:

```bash
itwillsync hub stop
```

Or just close all session terminals — the hub auto-shuts down 30 seconds after the last session disconnects.
