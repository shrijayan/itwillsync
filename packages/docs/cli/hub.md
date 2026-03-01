# Hub Management

The hub daemon is a background process that manages multiple sessions. It starts automatically and usually doesn't need manual intervention, but these commands help when it does.

## Hub Lifecycle

1. **Auto-start**: The first `itwillsync` session spawns the hub daemon
2. **Registration**: Each new session registers with the hub automatically
3. **Auto-shutdown**: Hub exits 30 seconds after the last session disconnects

## Commands

### View Dashboard Info

```bash
itwillsync hub info
```

Displays:
- QR code for the dashboard URL
- Full dashboard URL with authentication token
- Number of active sessions and their names

Use this when you:
- Need to re-scan the QR code on your phone
- Want to copy the dashboard URL to share with another device
- Lost the terminal output that showed the initial QR code

### List Sessions

```bash
itwillsync hub status
```

Shows all active sessions with:
- Session name (agent command)
- Status (active, idle)
- Uptime
- Port number

### Stop the Hub

```bash
itwillsync hub stop
```

Sends SIGTERM to the hub daemon process. This also terminates the dashboard — connected phones will lose their connection.

Individual sessions continue running as standalone servers (without the dashboard), unless they were also terminated.

## How Sessions Register

When you run `itwillsync -- claude`:

1. CLI checks if hub is running on port 7963 (localhost health check)
2. If no hub — spawns it as a detached background process
3. Hub writes its config to `~/.itwillsync/hub.json`
4. Session registers via the internal API: `POST http://127.0.0.1:7963/api/sessions`
5. Hub broadcasts the new session to all dashboard clients
6. On exit, session unregisters via `DELETE /api/sessions/:id`

## Troubleshooting

### Hub won't start

Check if port 7962 or 7963 is already in use:

```bash
lsof -i :7962
lsof -i :7963
```

### Stale hub files

If the hub crashed without cleanup, remove stale files:

```bash
rm ~/.itwillsync/hub.json ~/.itwillsync/hub.pid
```

### Check if hub is running

```bash
curl http://127.0.0.1:7963/api/health
```

Expected response: `{"status":"ok","sessions":N,"uptime":...}`
