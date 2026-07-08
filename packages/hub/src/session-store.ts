import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import { getItwillsyncHomeDir } from "@itwillsync/shared/paths";

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
  return join(getItwillsyncHomeDir(), "sessions.json");
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
    // 0o700: only owner can traverse; mode enforced after creation for existing dirs
    mkdirSync(dir, { recursive: true, mode: 0o700 });

    const data: PersistedSessions = {
      version: 1,
      sessions: this.sessions,
    };

    // 0o600: only owner can read; mode + explicit chmod covers both new and existing files
    writeFileSync(path, JSON.stringify(data, null, 2) + "\n", { encoding: "utf-8", mode: 0o600 });
    chmodSync(path, 0o600);
  }
}
