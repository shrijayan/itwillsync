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
