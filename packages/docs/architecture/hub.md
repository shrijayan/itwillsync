# Hub Daemon

The hub daemon is a background process that manages the multi-session dashboard. It coordinates session registration, serves the dashboard UI, and collects live terminal previews.

## Components

### Session Registry (`registry.ts`)

In-memory store of all active sessions. Uses a `Map<string, SessionInfo>` with EventEmitter for change notifications.

**Events emitted:**
- `session-added` — new session registered
- `session-removed` — session unregistered or process died
- `session-updated` — session renamed or status changed

**Health checks:** Every 15 seconds, the registry verifies each session's process is still alive using `process.kill(pid, 0)`. Dead sessions are automatically removed.

### Internal API (`internal-api.ts`)

HTTP server bound to `127.0.0.1:7963`. Only accessible from the local machine. No authentication required (same-machine trust).

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/health` | GET | Hub health check |
| `/api/sessions` | GET | List all sessions |
| `/api/sessions` | POST | Register a session |
| `/api/sessions/:id` | GET | Get session metadata (with memory usage) |
| `/api/sessions/:id` | DELETE | Unregister a session |
| `/api/sessions/:id/heartbeat` | PUT | Update last-seen timestamp |
| `/api/sessions/:id/stop` | POST | Send SIGTERM to session |
| `/api/sessions/:id/rename` | PUT | Rename a session |

### Dashboard Server (`server.ts`)

HTTP + WebSocket server bound to `0.0.0.0:7962`. Serves the dashboard web UI and provides real-time session updates via WebSocket.

**Authentication:** Master token required for HTML pages, API endpoints, and WebSocket upgrade. Static assets (JS/CSS) served without token.

**Rate limiting:** 5 failed auth attempts from the same IP triggers a 60-second lockout.

### Preview Collector (`preview-collector.ts`)

Subscribes to each session's WebSocket as a read-only client. Receives terminal output, strips ANSI escape codes, and buffers the last 5 lines per session.

Updates are throttled to 500ms per session to avoid overwhelming phone connections.

## Lifecycle

```
First session starts
    │
    ├─► Check port 7963 for running hub
    │     └─ Not running → spawn hub daemon (detached)
    │
    ├─► Hub starts:
    │     ├── Generates master token
    │     ├── Writes ~/.itwillsync/hub.json + hub.pid
    │     ├── Starts internal API (:7963)
    │     ├── Starts dashboard server (:7962)
    │     ├── Starts preview collector
    │     └── Prints "hub:ready:7963" to stdout
    │
    ├─► Session registers via POST /api/sessions
    │
    └─► Auto-shutdown timer starts (cancelled when sessions register)

Last session disconnects
    │
    └─► 30-second timer → hub exits, cleans up files
```

## Files on Disk

| File | Purpose | Created by | Cleaned up by |
|------|---------|-----------|---------------|
| `~/.itwillsync/hub.json` | Master token, ports, PID | Hub daemon | Hub shutdown |
| `~/.itwillsync/hub.pid` | Hub process ID | Hub daemon | Hub shutdown |
| `~/.itwillsync/config.json` | Networking preference | Setup wizard | Never (user config) |
