# WebSocket Protocol

itwillsync uses two WebSocket connections: one between sessions and phones, and one between the hub and phones.

## Session WebSocket (Phone <-> Session)

Used for full terminal I/O. Connects to the session's port with the session token.

### Client to Server

| Message | Fields | Description |
|---------|--------|-------------|
| `input` | `{ type: "input", data: string }` | Keyboard input from phone |
| `resize` | `{ type: "resize", cols: number, rows: number }` | Terminal resize |
| `resume` | `{ type: "resume", lastSeq: number }` | Request delta sync after reconnect |

### Server to Client

| Message | Fields | Description |
|---------|--------|-------------|
| `data` | `{ type: "data", data: string, seq: number }` | Terminal output from PTY |

### Delta Sync

Each `data` message includes a `seq` number — a running character count. When a client reconnects, it sends its last received `seq`. The server responds with only the missed data from its scrollback buffer (50KB).

## Dashboard WebSocket (Phone <-> Hub)

Used for real-time session list updates and management. Connects to port 7962 with the master token.

### Hub to Phone

| Message | Fields | Description |
|---------|--------|-------------|
| `sessions` | `{ type: "sessions", sessions: SessionInfo[] }` | Full session list (sent on connect) |
| `session-added` | `{ type: "session-added", session: SessionInfo }` | New session registered |
| `session-removed` | `{ type: "session-removed", sessionId: string }` | Session disconnected |
| `session-updated` | `{ type: "session-updated", session: SessionInfo }` | Session metadata changed |
| `preview` | `{ type: "preview", sessionId: string, lines: string[] }` | Live terminal preview (last 5 lines) |
| `metadata` | `{ type: "metadata", sessionId: string, metadata: object }` | Session metadata response |
| `operation-error` | `{ type: "operation-error", operation: string, sessionId: string, error: string }` | Operation failed |

### Phone to Hub

| Message | Fields | Description |
|---------|--------|-------------|
| `stop-session` | `{ type: "stop-session", sessionId: string }` | Stop a session (sends SIGTERM) |
| `rename-session` | `{ type: "rename-session", sessionId: string, name: string }` | Rename a session |
| `get-metadata` | `{ type: "get-metadata", sessionId: string }` | Request session metadata |

## SessionInfo Object

```typescript
{
  id: string;            // 16-char hex ID
  name: string;          // Display name (agent command or custom)
  port: number;          // Session's HTTP/WS port
  token: string;         // Session authentication token
  agent: string;         // Agent command (claude, aider, etc.)
  cwd: string;           // Working directory
  pid: number;           // Process ID
  connectedAt: number;   // Unix timestamp (ms)
  lastSeen: number;      // Last activity timestamp (ms)
  status: "active" | "idle" | "attention";
}
```

## Authentication

Both WebSocket connections validate tokens during the HTTP upgrade handshake:

1. Client sends: `ws://host:port?token=...`
2. Server validates token with constant-time comparison
3. Invalid token: socket destroyed with HTTP 401
4. Valid token: WebSocket upgrade proceeds

No per-message authentication after the upgrade — the connection is trusted once established.
