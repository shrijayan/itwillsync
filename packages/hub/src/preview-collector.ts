import { EventEmitter } from "node:events";
import { WebSocket } from "ws";
import type { SessionRegistry, SessionInfo } from "./registry.js";

/** Max lines to keep per session preview. */
const MAX_PREVIEW_LINES = 5;

/** Throttle interval: emit preview updates at most this often per session. */
const THROTTLE_MS = 500;

/** Max chars per preview line (truncate longer lines). */
const MAX_LINE_LENGTH = 80;

/** Reconnect delays for session WS connections. */
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 10_000;

interface PreviewCollectorEvents {
  "preview-data": [sessionId: string, lines: string[]];
}

interface SessionConnection {
  ws: WebSocket | null;
  lines: string[];
  rawBuffer: string;
  throttleTimer: ReturnType<typeof setTimeout> | null;
  dirty: boolean;
  reconnectAttempt: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  closed: boolean;
}

/**
 * Checks if raw terminal data contains an attention signal:
 * standalone BEL, OSC 9 (iTerm2, excluding progress bars), OSC 99 (Kitty), OSC 777 (Ghostty).
 */
export function containsAttentionSignal(data: string): boolean {
  // OSC attention sequences
  if (/\x1b\]9;(?!4;)/.test(data)) return true;   // OSC 9 (skip progress bars 9;4;...)
  if (/\x1b\]99;/.test(data)) return true;          // OSC 99 (Kitty)
  if (/\x1b\]777;/.test(data)) return true;         // OSC 777 (Ghostty)

  // Standalone BEL — strip OSC sequences first (they use BEL as terminator)
  const withoutOsc = data.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "");
  if (withoutOsc.includes("\x07")) return true;

  return false;
}

/**
 * Strips ANSI escape codes from terminal output.
 * Removes CSI sequences, OSC sequences, and other control chars.
 */
export function stripAnsi(str: string): string {
  return str
    // CSI sequences: ESC [ ... <letter>
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "")
    // OSC sequences: ESC ] ... BEL or ESC ] ... ST
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    // Other ESC sequences (e.g., ESC ( B, ESC > , etc.)
    .replace(/\x1b[()#][A-Za-z0-9]/g, "")
    .replace(/\x1b[>=<]/g, "")
    // Single-char ESC sequences
    .replace(/\x1b[A-Za-z]/g, "")
    // Strip carriage return (terminal uses \r\n or \r for overwriting)
    .replace(/\r/g, "");
}

/**
 * Collects live terminal preview data from session WebSockets.
 * Subscribes to each session's WS as a read-only client,
 * strips ANSI codes, and emits throttled preview updates.
 */
export class PreviewCollector extends EventEmitter<PreviewCollectorEvents> {
  private connections = new Map<string, SessionConnection>();
  private registry: SessionRegistry;

  constructor(registry: SessionRegistry) {
    super();
    this.registry = registry;

    // Subscribe to registry events
    registry.on("session-added", (session) => this.connectToSession(session));
    registry.on("session-removed", (sessionId) => this.disconnectSession(sessionId));
  }

  /**
   * Connect to a session's WebSocket to receive terminal output.
   */
  private connectToSession(session: SessionInfo): void {
    const conn: SessionConnection = {
      ws: null,
      lines: [],
      rawBuffer: "",
      throttleTimer: null,
      dirty: false,
      reconnectAttempt: 0,
      reconnectTimer: null,
      closed: false,
    };

    this.connections.set(session.id, conn);
    this.openWebSocket(session.id, session);
  }

  private openWebSocket(sessionId: string, session: SessionInfo): void {
    const conn = this.connections.get(sessionId);
    if (!conn || conn.closed) return;

    const wsUrl = `ws://127.0.0.1:${session.port}?token=${session.token}`;

    try {
      const ws = new WebSocket(wsUrl);
      conn.ws = ws;

      ws.on("open", () => {
        conn.reconnectAttempt = 0;
      });

      ws.on("message", (raw: Buffer | string) => {
        try {
          const msg = JSON.parse(typeof raw === "string" ? raw : raw.toString("utf-8"));
          if (msg.type === "data" && typeof msg.data === "string") {
            this.handleData(sessionId, msg.data);
          }
        } catch {
          // Ignore malformed messages
        }
      });

      ws.on("close", () => {
        if (!conn.closed) {
          this.scheduleReconnect(sessionId, session);
        }
      });

      ws.on("error", () => {
        // Error will trigger close event
      });
    } catch {
      this.scheduleReconnect(sessionId, session);
    }
  }

  private scheduleReconnect(sessionId: string, session: SessionInfo): void {
    const conn = this.connections.get(sessionId);
    if (!conn || conn.closed) return;

    conn.ws = null;
    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(1.5, conn.reconnectAttempt),
      RECONNECT_MAX_MS,
    );
    conn.reconnectAttempt++;

    conn.reconnectTimer = setTimeout(() => {
      // Re-check session is still registered
      const currentSession = this.registry.getById(sessionId);
      if (currentSession && !conn.closed) {
        this.openWebSocket(sessionId, currentSession);
      }
    }, delay);
  }

  /**
   * Process incoming terminal data: strip ANSI, buffer lines, throttle output.
   */
  private handleData(sessionId: string, data: string): void {
    const conn = this.connections.get(sessionId);
    if (!conn) return;

    // Detect attention signals (BEL/OSC) before stripping
    if (containsAttentionSignal(data)) {
      const session = this.registry.getById(sessionId);
      if (session && session.status !== "attention") {
        this.registry.updateStatus(sessionId, "attention");
      }
    }

    // Strip ANSI and append to buffer
    const clean = stripAnsi(data);
    conn.rawBuffer += clean;

    // Split into lines, keeping the last incomplete line in the buffer
    const parts = conn.rawBuffer.split("\n");
    conn.rawBuffer = parts.pop() || "";

    // Add complete lines to the preview buffer
    for (const line of parts) {
      const trimmed = line.trimEnd();
      if (trimmed.length > 0) {
        conn.lines.push(
          trimmed.length > MAX_LINE_LENGTH
            ? trimmed.slice(0, MAX_LINE_LENGTH) + "..."
            : trimmed,
        );
      }
    }

    // Keep only the last N lines
    if (conn.lines.length > MAX_PREVIEW_LINES) {
      conn.lines = conn.lines.slice(-MAX_PREVIEW_LINES);
    }

    // Mark dirty and schedule throttled emit
    conn.dirty = true;
    this.scheduleEmit(sessionId);
  }

  private scheduleEmit(sessionId: string): void {
    const conn = this.connections.get(sessionId);
    if (!conn || conn.throttleTimer) return;

    conn.throttleTimer = setTimeout(() => {
      conn.throttleTimer = null;
      if (conn.dirty) {
        conn.dirty = false;
        this.emit("preview-data", sessionId, [...conn.lines]);
      }
    }, THROTTLE_MS);
  }

  /**
   * Disconnect from a session and cleanup resources.
   */
  private disconnectSession(sessionId: string): void {
    const conn = this.connections.get(sessionId);
    if (!conn) return;

    conn.closed = true;

    if (conn.ws) {
      conn.ws.close();
      conn.ws = null;
    }
    if (conn.throttleTimer) {
      clearTimeout(conn.throttleTimer);
    }
    if (conn.reconnectTimer) {
      clearTimeout(conn.reconnectTimer);
    }

    this.connections.delete(sessionId);
  }

  /**
   * Get current preview lines for a session.
   */
  getPreview(sessionId: string): string[] {
    return this.connections.get(sessionId)?.lines || [];
  }

  /**
   * Get all current previews keyed by session ID.
   */
  getAllPreviews(): Map<string, string[]> {
    const result = new Map<string, string[]>();
    for (const [id, conn] of this.connections) {
      result.set(id, [...conn.lines]);
    }
    return result;
  }

  /**
   * Close all connections and cleanup.
   */
  close(): void {
    for (const sessionId of this.connections.keys()) {
      this.disconnectSession(sessionId);
    }
  }
}
