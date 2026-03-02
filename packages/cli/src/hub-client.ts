import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { request } from "node:http";

/** Port for the hub's internal API (localhost only). */
export const HUB_INTERNAL_PORT = 7963;

/** Port for the hub's external dashboard. */
export const HUB_EXTERNAL_PORT = 7962;

/** Default starting port for session servers. */
export const SESSION_PORT_START = 7964;

export interface HubConfig {
  masterToken: string;
  externalPort: number;
  internalPort: number;
  pid: number;
  startedAt: number;
}

export interface SessionRegistration {
  name: string;
  port: number;
  token: string;
  agent: string;
  cwd: string;
  pid: number;
}

export interface RegisteredSession {
  id: string;
  name: string;
  port: number;
  token: string;
  agent: string;
  cwd: string;
  pid: number;
  connectedAt: number;
  lastSeen: number;
  status: string;
}

function getHubDir(): string {
  return process.env.ITWILLSYNC_CONFIG_DIR || join(homedir(), ".itwillsync");
}

function getHubConfigPath(): string {
  return join(getHubDir(), "hub.json");
}

/**
 * Check if the hub daemon is running by calling its health endpoint.
 */
export async function discoverHub(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = request(
      {
        hostname: "127.0.0.1",
        port: HUB_INTERNAL_PORT,
        path: "/api/health",
        method: "GET",
        timeout: 2000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => { data += chunk; });
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            resolve(json.status === "ok");
          } catch {
            resolve(false);
          }
        });
      },
    );

    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

/**
 * Get the hub daemon's PID from its health endpoint.
 * Useful when hub.json is missing but the hub is still running.
 */
export async function getHubPidFromHealth(): Promise<number | null> {
  return new Promise((resolve) => {
    const req = request(
      {
        hostname: "127.0.0.1",
        port: HUB_INTERNAL_PORT,
        path: "/api/health",
        method: "GET",
        timeout: 2000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => { data += chunk; });
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            resolve(json.pid && typeof json.pid === "number" ? json.pid : null);
          } catch {
            resolve(null);
          }
        });
      },
    );

    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

/**
 * Kill a stale hub process and clean up its config files.
 * Returns true if the stale hub was successfully terminated.
 */
export async function killStaleHub(): Promise<boolean> {
  const pid = await getHubPidFromHealth();
  if (!pid) return false;

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return false;
  }

  // Wait for the process to exit and ports to free
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 200));
    const stillRunning = await discoverHub();
    if (!stillRunning) break;
  }

  // Clean up any leftover config files
  const hubDir = getHubDir();
  try { unlinkSync(join(hubDir, "hub.json")); } catch {}
  try { unlinkSync(join(hubDir, "hub.pid")); } catch {}

  return true;
}

/**
 * Spawn the hub daemon as a detached background process.
 * Returns when the hub signals it's ready.
 */
export async function spawnHub(): Promise<void> {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const hubPath = join(__dirname, "hub", "daemon.js");

  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawn("node", [hubPath], {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        // Pass config dir to hub
        ITWILLSYNC_CONFIG_DIR: process.env.ITWILLSYNC_CONFIG_DIR || "",
      },
    });

    child.unref();

    // Wait for the hub to signal readiness
    let output = "";
    let stderrOutput = "";
    const timeout = setTimeout(() => {
      reject(new Error("Hub daemon startup timed out"));
    }, 10_000);

    child.stdout?.on("data", (data: Buffer) => {
      output += data.toString();
      if (output.includes("hub:ready:")) {
        clearTimeout(timeout);
        // Detach from stdout/stderr to let the hub run independently
        child.stdout?.destroy();
        child.stderr?.destroy();
        resolve();
      }
    });

    child.stderr?.on("data", (data: Buffer) => {
      stderrOutput += data.toString();
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to spawn hub daemon: ${err.message}`));
    });

    child.on("exit", (code) => {
      clearTimeout(timeout);
      if (code !== null && code !== 0) {
        const detail = stderrOutput.trim();
        reject(new Error(
          `Hub daemon exited with code ${code}${detail ? `:\n${detail}` : ""}`
        ));
      }
    });
  });
}

/**
 * Read the hub config file (written by the daemon on startup).
 */
export function getHubConfig(): HubConfig | null {
  const configPath = getHubConfigPath();
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const raw = readFileSync(configPath, "utf-8");
    return JSON.parse(raw) as HubConfig;
  } catch {
    return null;
  }
}

/**
 * Register this session with the hub daemon.
 * Returns the registered session info (including assigned ID).
 */
export async function registerSession(
  registration: SessionRegistration,
): Promise<RegisteredSession> {
  const body = JSON.stringify(registration);

  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: "127.0.0.1",
        port: HUB_INTERNAL_PORT,
        path: "/api/sessions",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: 5000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => { data += chunk; });
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (res.statusCode === 201 && json.session) {
              resolve(json.session as RegisteredSession);
            } else {
              reject(new Error(`Registration failed: ${json.error || "Unknown error"}`));
            }
          } catch {
            reject(new Error("Invalid response from hub"));
          }
        });
      },
    );

    req.on("error", (err) => reject(new Error(`Failed to register with hub: ${err.message}`)));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Registration request timed out"));
    });
    req.end(body);
  });
}

/**
 * Unregister this session from the hub daemon.
 */
export async function unregisterSession(sessionId: string): Promise<void> {
  return new Promise((resolve) => {
    const req = request(
      {
        hostname: "127.0.0.1",
        port: HUB_INTERNAL_PORT,
        path: `/api/sessions/${sessionId}`,
        method: "DELETE",
        timeout: 3000,
      },
      () => resolve(),
    );

    req.on("error", () => resolve()); // Best-effort unregister
    req.on("timeout", () => {
      req.destroy();
      resolve();
    });
    req.end();
  });
}

/**
 * List all sessions from the hub's internal API.
 */
export async function listSessions(): Promise<RegisteredSession[]> {
  return new Promise((resolve) => {
    const req = request(
      {
        hostname: "127.0.0.1",
        port: HUB_INTERNAL_PORT,
        path: "/api/sessions",
        method: "GET",
        timeout: 3000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => { data += chunk; });
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            resolve(json.sessions || []);
          } catch {
            resolve([]);
          }
        });
      },
    );
    req.on("error", () => resolve([]));
    req.on("timeout", () => {
      req.destroy();
      resolve([]);
    });
    req.end();
  });
}

/**
 * Stop the hub daemon by reading its PID and sending SIGTERM.
 * Falls back to querying the health endpoint if hub.json is missing.
 */
export async function stopHub(): Promise<boolean> {
  // Try from hub.json first
  const config = getHubConfig();
  if (config) {
    try {
      process.kill(config.pid, "SIGTERM");
      return true;
    } catch {
      // PID may be stale, try health endpoint
    }
  }

  // Fall back to health endpoint for PID
  const pid = await getHubPidFromHealth();
  if (!pid) return false;

  try {
    process.kill(pid, "SIGTERM");
    return true;
  } catch {
    return false;
  }
}

/**
 * Send a heartbeat to the hub to keep the session alive.
 */
export async function sendHeartbeat(sessionId: string): Promise<void> {
  return new Promise((resolve) => {
    const req = request(
      {
        hostname: "127.0.0.1",
        port: HUB_INTERNAL_PORT,
        path: `/api/sessions/${sessionId}/heartbeat`,
        method: "PUT",
        timeout: 2000,
      },
      () => resolve(),
    );

    req.on("error", () => resolve());
    req.on("timeout", () => {
      req.destroy();
      resolve();
    });
    req.end();
  });
}
