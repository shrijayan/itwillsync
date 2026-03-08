import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

export interface PersistedSession {
  id: string;
  name: string;
  port: number;
  token: string;
  agent: string;
  cwd: string;
  pid: number;
  connectedAt: number;
  lastSeen: number;
  status: "active" | "idle" | "attention" | "ended";
}

interface PersistedSessions {
  version: 1;
  sessions: PersistedSession[];
}

function getStorePath(): string {
  const dir = process.env.ITWILLSYNC_CONFIG_DIR || join(homedir(), ".itwillsync");
  return join(dir, "sessions.json");
}

export class SessionStore {
  private savePending = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private sessions: PersistedSession[] = [];

  constructor() {
    this.sessions = this.readFromDisk();
  }

  /** Load sessions from disk and mark stale ones (dead processes) as ended. */
  loadAndMarkStale(): PersistedSession[] {
    for (const session of this.sessions) {
      if (session.status === "ended") continue;

      try {
        process.kill(session.pid, 0); // Check if process is alive
      } catch {
        session.status = "ended";
        session.lastSeen = Date.now();
      }
    }

    // Prune sessions ended more than 24 hours ago
    const cutoff = Date.now() - 86_400_000;
    this.sessions = this.sessions.filter(
      (s) => s.status !== "ended" || s.lastSeen > cutoff,
    );

    this.writeToDisk();
    return this.sessions.filter((s) => s.status !== "ended");
  }

  /** Save current sessions (debounced 500ms). */
  save(sessions: PersistedSession[]): void {
    this.sessions = sessions;

    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.writeToDisk();
    }, 500);
  }

  /** Get all persisted sessions (including ended). */
  getAllSessions(): PersistedSession[] {
    return this.sessions;
  }

  /** Flush any pending save immediately. */
  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.writeToDisk();
  }

  private readFromDisk(): PersistedSession[] {
    const path = getStorePath();
    if (!existsSync(path)) return [];

    try {
      const raw = readFileSync(path, "utf-8");
      const data: PersistedSessions = JSON.parse(raw);
      if (data.version !== 1 || !Array.isArray(data.sessions)) return [];
      return data.sessions;
    } catch {
      return [];
    }
  }

  private writeToDisk(): void {
    const path = getStorePath();
    const dir = dirname(path);
    mkdirSync(dir, { recursive: true });

    const data: PersistedSessions = {
      version: 1,
      sessions: this.sessions,
    };

    writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
  }
}
