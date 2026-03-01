import { writeFileSync, mkdirSync, unlinkSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateToken } from "./auth.js";
import { SessionRegistry } from "./registry.js";
import { createInternalApi } from "./internal-api.js";
import { createDashboardServer } from "./server.js";
import { PreviewCollector } from "./preview-collector.js";

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

  // Create session registry
  const registry = new SessionRegistry();
  registry.startHealthChecks();

  // Resolve path to the built dashboard
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const dashboardPath = join(__dirname, "dashboard");

  // Start internal API (localhost only)
  const internalApi = createInternalApi({
    registry,
    port: HUB_INTERNAL_PORT,
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
  });

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
    previewCollector.close();
    registry.stopHealthChecks();
    registry.clear();
    internalApi.close();
    dashboardServer.close();

    // Remove PID file and hub config
    try { unlinkSync(getPidPath()); } catch {}
    try { unlinkSync(getHubConfigPath()); } catch {}
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
