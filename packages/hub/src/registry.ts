import { EventEmitter } from "node:events";
import { randomBytes } from "node:crypto";

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

export class SessionRegistry extends EventEmitter<RegistryEvents> {
  private sessions = new Map<string, SessionInfo>();
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;

  register(registration: SessionRegistration): SessionInfo {
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
    return session;
  }

  unregister(id: string): boolean {
    const existed = this.sessions.delete(id);
    if (existed) {
      this.emit("session-removed", id);
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
      session.status = "active";
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
    }
  }

  /**
   * Start periodic health checks: verify session processes are still alive.
   * Removes dead sessions (process no longer running).
   */
  startHealthChecks(intervalMs = 15_000): void {
    this.healthCheckInterval = setInterval(() => {
      for (const [id, session] of this.sessions) {
        try {
          // process.kill(pid, 0) checks if process exists without sending signal
          process.kill(session.pid, 0);

          // Update idle status based on lastSeen
          const elapsed = Date.now() - session.lastSeen;
          if (elapsed > 30_000 && session.status === "active") {
            session.status = "idle";
            this.emit("session-updated", session);
          }
        } catch {
          // Process no longer exists — remove session
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
