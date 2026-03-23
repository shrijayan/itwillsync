import { writeFileSync, mkdirSync, unlinkSync, existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";
import { generateToken } from "./auth.js";
import { SessionRegistry } from "./registry.js";
import { SessionStore } from "./session-store.js";
import { ToolHistory } from "./tool-history.js";
import { createInternalApi } from "./internal-api.js";
import { createDashboardServer } from "./server.js";
import { PreviewCollector } from "./preview-collector.js";
import { SleepPrevention } from "./sleep-prevention.js";
import { WindowsFirewall } from "./windows-firewall.js";

/** Port for the external dashboard (accessible from phone). SYNC on phone keypad. */
export const HUB_EXTERNAL_PORT = 7962;

/** Port for the internal API (localhost only, session registration). */
export const HUB_INTERNAL_PORT = 7963;

/** Seconds to wait after last session before auto-shutdown. */
const AUTO_SHUTDOWN_DELAY_MS = 30_000;

function getHubDir(): string {
  return process.env.ITWILLSYNC_CONFIG_DIR || join(homedir(), ".itwillsync");
}

function getPidPath(): string {
  return join(getHubDir(), "hub.pid");
}

function getHubConfigPath(): string {
  return join(getHubDir(), "hub.json");
}

/** Validate a tool name: alphanumeric, hyphens, underscores, dots only. */
function isValidToolName(tool: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(tool) && tool.length > 0 && tool.length <= 100;
}

/**
 * Spawn a new headless CLI session.
 * The CLI process registers with the hub as usual.
 */
function spawnSession(
  tool: string,
  cwd: string,
  cliEntryPath: string,
): ChildProcess {
  const child = spawn(process.execPath, [cliEntryPath, "--headless", "--", tool], {
    cwd,
    stdio: "ignore",
    detached: true,
    env: { ...process.env },
  });
  child.unref();
  return child;
}

async function main(): Promise<void> {
  const hubDir = getHubDir();
  mkdirSync(hubDir, { recursive: true });

  // Generate master token
  const masterToken = generateToken();
  const startedAt = Date.now();

  // Write PID file
  writeFileSync(getPidPath(), String(process.pid), "utf-8");

  // Write hub config (read by CLI sessions to get master token)
  const hubConfig = {
    masterToken,
    externalPort: HUB_EXTERNAL_PORT,
    internalPort: HUB_INTERNAL_PORT,
    pid: process.pid,
    startedAt,
  };
  writeFileSync(getHubConfigPath(), JSON.stringify(hubConfig, null, 2) + "\n", "utf-8");

  // Create session store + registry
  const sessionStore = new SessionStore();
  const registry = new SessionRegistry({ store: sessionStore });
  registry.startHealthChecks();

  // Tool history for autocomplete
  const toolHistory = new ToolHistory();

  // Sleep prevention (checks for orphaned flag on startup)
  const sleepPrevention = new SleepPrevention();

  // Windows firewall (auto-add inbound rules so phones can connect)
  const windowsFirewall = new WindowsFirewall();
  await windowsFirewall.addRule("hub", HUB_EXTERNAL_PORT);

  // Clean up old session logs (default: 30 days retention)
  const logsDir = join(hubDir, "logs");
  if (existsSync(logsDir)) {
    const retentionMs = 30 * 86_400_000;
    const cutoff = Date.now() - retentionMs;
    try {
      for (const file of readdirSync(logsDir)) {
        const filePath = join(logsDir, file);
        try {
          const stat = statSync(filePath);
          if (stat.mtimeMs < cutoff) unlinkSync(filePath);
        } catch { /* ignore stat/unlink */ }
      }
    } catch { /* ignore readdir */ }
  }

  // Resolve paths
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const dashboardPath = join(__dirname, "dashboard");
  // Hub lives at dist/hub/daemon.js, CLI entry is at dist/index.js
  const cliEntryPath = join(__dirname, "..", "index.js");

  // Start internal API (localhost only)
  const internalApi = createInternalApi({
    registry,
    port: HUB_INTERNAL_PORT,
    windowsFirewall,
  });

  // Start preview collector (subscribes to session WebSockets for live output)
  const previewCollector = new PreviewCollector(registry);

  // Start external dashboard server
  const dashboardServer = createDashboardServer({
    registry,
    masterToken,
    dashboardPath,
    host: "0.0.0.0",
    port: HUB_EXTERNAL_PORT,
    previewCollector,
    toolHistory,
    sleepPrevention,
    onCreateSession: (tool: string, cwd: string) => {
      if (!isValidToolName(tool)) {
        throw new Error(`Invalid tool name: ${tool}`);
      }
      toolHistory.recordUsage(tool);
      spawnSession(tool, cwd, cliEntryPath);
    },
  });

  // Wait for both servers to actually bind to their ports
  await Promise.all([
    internalApi.listen(),
    dashboardServer.listen(),
  ]);

  // Auto-shutdown timer: shut down when no sessions remain
  let shutdownTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleShutdown(): void {
    if (shutdownTimer) return;
    shutdownTimer = setTimeout(() => {
      if (registry.size === 0) {
        cleanup();
        process.exit(0);
      }
      shutdownTimer = null;
    }, AUTO_SHUTDOWN_DELAY_MS);
  }

  function cancelShutdown(): void {
    if (shutdownTimer) {
      clearTimeout(shutdownTimer);
      shutdownTimer = null;
    }
  }

  registry.on("session-added", () => {
    cancelShutdown();
  });

  registry.on("session-removed", () => {
    if (registry.size === 0) {
      scheduleShutdown();
    }
  });

  // Start with shutdown timer (will be cancelled when first session registers)
  scheduleShutdown();

  function cleanup(): void {
    windowsFirewall.cleanupSync();
    sleepPrevention.cleanupSync();
    previewCollector.close();
    registry.stopHealthChecks();
    sessionStore.flush();
    registry.clear();
    internalApi.close();
    dashboardServer.close();

    // Remove PID file and hub config
    try { unlinkSync(getPidPath()); } catch { /* ignore cleanup */ }
    try { unlinkSync(getHubConfigPath()); } catch { /* ignore cleanup */ }
  }

  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });

  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });

  // Signal readiness by writing to stdout (parent process reads this)
  console.log(`hub:ready:${HUB_INTERNAL_PORT}`);
}

main().catch((err) => {
  console.error("Hub daemon fatal error:", err);
  process.exit(1);
});
