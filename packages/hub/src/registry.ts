import { EventEmitter } from "node:events";
import { randomBytes } from "node:crypto";
import type { SessionStore, PersistedSession } from "./session-store.js";

export interface SessionInfo {
  id: string;
  name: string;
  port: number;
  token: string;
  agent: string;
  cwd: string;
  pid: number;
  connectedAt: number;
  lastSeen: number;
  status: "active" | "idle" | "attention";
}

export interface SessionRegistration {
  name: string;
  port: number;
  token: string;
  agent: string;
  cwd: string;
  pid: number;
}

interface RegistryEvents {
  "session-added": [session: SessionInfo];
  "session-removed": [sessionId: string];
  "session-updated": [session: SessionInfo];
}

export interface RegistryOptions {
  maxSessions?: number;
  store?: SessionStore;
}

export class SessionRegistry extends EventEmitter<RegistryEvents> {
  private sessions = new Map<string, SessionInfo>();
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private maxSessions: number;
  private store: SessionStore | null;

  constructor(options: RegistryOptions = {}) {
    super();
    this.maxSessions = options.maxSessions ?? 20;
    this.store = options.store ?? null;

    // Restore alive sessions from disk
    if (this.store) {
      const alive = this.store.loadAndMarkStale();
      for (const s of alive) {
        this.sessions.set(s.id, {
          id: s.id,
          name: s.name,
          port: s.port,
          token: s.token,
          agent: s.agent,
          cwd: s.cwd,
          pid: s.pid,
          connectedAt: s.connectedAt,
          lastSeen: s.lastSeen,
          status: s.status === "ended" ? "idle" : s.status as SessionInfo["status"],
        });
      }
    }
  }

  private persistSessions(): void {
    if (!this.store) return;
    const sessions: PersistedSession[] = this.getAll().map((s) => ({ ...s }));
    this.store.save(sessions);
  }

  register(registration: SessionRegistration): SessionInfo {
    if (this.sessions.size >= this.maxSessions) {
      throw new Error(`Maximum sessions reached (${this.maxSessions})`);
    }

    const id = randomBytes(8).toString("hex");
    const now = Date.now();

    const session: SessionInfo = {
      id,
      ...registration,
      connectedAt: now,
      lastSeen: now,
      status: "active",
    };

    this.sessions.set(id, session);
    this.emit("session-added", session);
    this.persistSessions();
    return session;
  }

  unregister(id: string): boolean {
    const existed = this.sessions.delete(id);
    if (existed) {
      this.emit("session-removed", id);
      this.persistSessions();
    }
    return existed;
  }

  getAll(): SessionInfo[] {
    return Array.from(this.sessions.values());
  }

  getById(id: string): SessionInfo | undefined {
    return this.sessions.get(id);
  }

  get size(): number {
    return this.sessions.size;
  }

  updateLastSeen(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      session.lastSeen = Date.now();
      if (session.status === "idle") {
        session.status = "active";
      }
    }
  }

  rename(id: string, newName: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.name = newName;
    this.emit("session-updated", session);
    return true;
  }

  updateStatus(id: string, status: SessionInfo["status"]): void {
    const session = this.sessions.get(id);
    if (session) {
      session.status = status;
      this.emit("session-updated", session);
      this.persistSessions();
    }
  }

  /**
   * Start periodic health checks: verify session processes are still alive.
   * Removes dead sessions (process no longer running AND no recent heartbeat).
   */
  startHealthChecks(intervalMs = 15_000): void {
    this.healthCheckInterval = setInterval(() => {
      const now = Date.now();
      for (const [id, session] of this.sessions) {
        const elapsed = now - session.lastSeen;

        // If CLI sent a heartbeat recently, session is alive — trust it
        // over process.kill which can be unreliable (EPERM, macOS quirks)
        if (elapsed <= 20_000) {
          continue;
        }

        try {
          // process.kill(pid, 0) checks if process exists without sending signal
          process.kill(session.pid, 0);

          // No recent heartbeat + process alive → mark idle
          if (elapsed > 30_000 && session.status === "active") {
            session.status = "idle";
            this.emit("session-updated", session);
          }
        } catch {
          // No recent heartbeat AND process gone → remove session
          this.sessions.delete(id);
          this.emit("session-removed", id);
        }
      }
    }, intervalMs);
  }

  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  clear(): void {
    const ids = Array.from(this.sessions.keys());
    this.sessions.clear();
    for (const id of ids) {
      this.emit("session-removed", id);
    }
  }
}
