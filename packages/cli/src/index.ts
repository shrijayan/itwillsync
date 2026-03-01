import { PtyManager, getDefaultShell } from "./pty-manager.js";
import { generateToken } from "./auth.js";
import { findAvailablePort, resolveSessionIP } from "./network.js";
import { createSyncServer } from "./server.js";
import { displayQR } from "./qr.js";
import { configExists, loadConfig, type NetworkingMode } from "./config.js";
import { runSetupWizard } from "./wizard.js";
import { parseArgs, printHelp } from "./cli-options.js";
import {
  discoverHub,
  spawnHub,
  getHubConfig,
  registerSession,
  unregisterSession,
  sendHeartbeat,
  listSessions,
  stopHub,
  HUB_EXTERNAL_PORT,
  type RegisteredSession,
} from "./hub-client.js";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

/**
 * Prevents the system from idle-sleeping while a sync session is active.
 * Uses OS-native tools — auto-releases when itwillsync exits.
 */
function preventSleep(): ChildProcess | null {
  try {
    if (process.platform === "darwin") {
      // caffeinate -i = prevent idle sleep, -w PID = auto-exit when our process dies
      const child = spawn("caffeinate", ["-i", "-w", String(process.pid)], {
        stdio: "ignore",
        detached: true,
      });
      child.unref();
      return child;
    } else if (process.platform === "linux") {
      // systemd-inhibit blocks idle sleep; "sleep infinity" keeps it alive
      return spawn("systemd-inhibit", [
        "--what=idle",
        "--who=itwillsync",
        "--why=Terminal sync session active",
        "sleep", "infinity",
      ], { stdio: "ignore" });
    }
  } catch {
    // Sleep prevention is best-effort — don't crash if tool is missing
  }
  return null;
}

/**
 * Ensure the hub daemon is running. Spawns it if needed.
 * Returns true if this session is the first (should show QR code).
 */
async function ensureHub(): Promise<boolean> {
  const hubRunning = await discoverHub();

  if (hubRunning) {
    return false; // Hub already running, we're not the first session
  }

  // Spawn hub daemon
  try {
    await spawnHub();
    // Wait briefly for hub to write its config file
    await new Promise((resolve) => setTimeout(resolve, 500));
    return true; // We spawned the hub — show QR
  } catch (err) {
    console.warn(`\n  Warning: Could not start hub daemon: ${(err as Error).message}`);
    console.warn("  Running in standalone mode (no dashboard).\n");
    return true; // Show QR for direct session access as fallback
  }
}

/**
 * Handle hub management flags: --hub-info, --hub-stop, --hub-status
 */
async function handleHubCommand(options: ReturnType<typeof parseArgs>): Promise<void> {
  const hubConfig = getHubConfig();
  const hubRunning = await discoverHub();

  if (options.hubStop) {
    if (!hubRunning || !hubConfig) {
      console.log("\n  No hub daemon is running.\n");
      return;
    }
    const stopped = stopHub();
    if (stopped) {
      console.log("\n  Hub daemon stopped.\n");
    } else {
      console.log("\n  Failed to stop hub daemon.\n");
    }
    return;
  }

  if (options.hubStatus) {
    if (!hubRunning) {
      console.log("\n  No hub daemon is running.\n");
      return;
    }
    const sessions = await listSessions();
    console.log(`\n  Hub is running. ${sessions.length} active session(s).\n`);
    if (sessions.length > 0) {
      for (const s of sessions) {
        const uptime = Math.floor((Date.now() - s.connectedAt) / 60_000);
        console.log(`    ${s.name || s.agent}  (${s.status}, ${uptime}m, port ${s.port})`);
      }
      console.log("");
    }
    return;
  }

  if (options.hubInfo) {
    if (!hubRunning || !hubConfig) {
      console.log("\n  No hub daemon is running.");
      console.log("  Start a session with: itwillsync -- <agent>\n");
      return;
    }

    // Determine networking mode for IP resolution
    let networkingMode: NetworkingMode = "local";
    if (options.tailscale) {
      networkingMode = "tailscale";
    } else if (options.local) {
      networkingMode = "local";
    } else if (configExists()) {
      networkingMode = loadConfig().networkingMode;
    }

    const ip = await resolveSessionIP(networkingMode, false);
    const dashboardUrl = `http://${ip}:${HUB_EXTERNAL_PORT}?token=${hubConfig.masterToken}`;

    displayQR(dashboardUrl);
    console.log(`  Dashboard: ${dashboardUrl}`);

    const sessions = await listSessions();
    console.log(`  Sessions: ${sessions.length} active`);
    if (sessions.length > 0) {
      for (const s of sessions) {
        const uptime = Math.floor((Date.now() - s.connectedAt) / 60_000);
        console.log(`    ${s.name || s.agent}  (${s.status}, ${uptime}m)`);
      }
    }
    console.log("");
    return;
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv);

  // Handle setup subcommand
  if (options.subcommand === "setup") {
    await runSetupWizard();
    return;
  }

  // Handle hub management flags (standalone, no session needed)
  if (options.hubInfo || options.hubStop || options.hubStatus) {
    await handleHubCommand(options);
    return;
  }

  // Validate conflicting flags
  if (options.tailscale && options.local) {
    console.error("Error: Cannot use both --tailscale and --local.\n");
    process.exit(1);
  }

  // First-run: trigger wizard if no config exists and no override flags
  if (!configExists() && !options.tailscale && !options.local && process.stdin.isTTY) {
    await runSetupWizard();
  }

  if (options.command.length === 0) {
    console.error("Error: No command specified.\n");
    printHelp();
    process.exit(1);
  }

  // Determine networking mode: CLI flag > saved config > default
  let networkingMode: NetworkingMode = "local";
  if (options.tailscale) {
    networkingMode = "tailscale";
  } else if (options.local) {
    networkingMode = "local";
  } else {
    const config = loadConfig();
    networkingMode = config.networkingMode;
  }

  // Parse command and arguments
  const [cmd, ...cmdArgs] = options.command;

  // Discover or spawn hub daemon
  const isFirstSession = await ensureHub();
  const hubConfig = getHubConfig();

  // Generate auth token for this session
  const token = generateToken();

  // Find available port for session server
  const port = await findAvailablePort(options.port);
  const host = options.localhost ? "127.0.0.1" : "0.0.0.0";

  // Determine IP for the connection URL
  const ip = await resolveSessionIP(networkingMode, options.localhost);

  // Resolve path to the built web client
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const webClientPath = join(__dirname, "web-client");

  // Create PTY
  const ptyManager = new PtyManager(cmd, cmdArgs);

  // Create session server
  const server = createSyncServer({
    ptyManager,
    token,
    webClientPath,
    host,
    port,
    localTerminalOwnsResize: true,
  });

  // Register with hub
  let registeredSession: RegisteredSession | null = null;
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  if (hubConfig) {
    try {
      registeredSession = await registerSession({
        name: cmd,
        port,
        token,
        agent: cmd,
        cwd: process.cwd(),
        pid: ptyManager.pid,
      });

      // Start heartbeat to keep session alive in hub registry
      heartbeatInterval = setInterval(() => {
        if (registeredSession) {
          sendHeartbeat(registeredSession.id);
        }
      }, 10_000);
    } catch (err) {
      console.warn(`  Warning: Failed to register with hub: ${(err as Error).message}`);
    }
  }

  // Display connection info
  const dashboardUrl = hubConfig
    ? `http://${ip}:${HUB_EXTERNAL_PORT}?token=${hubConfig.masterToken}`
    : null;

  if (isFirstSession && dashboardUrl && !options.noQr) {
    // First session with hub — show QR pointing to dashboard
    displayQR(dashboardUrl);
    console.log(`  Dashboard: ${dashboardUrl}`);
  } else if (isFirstSession && !options.noQr) {
    // Fallback: no hub, show direct session URL
    const directUrl = `http://${ip}:${port}?token=${token}`;
    displayQR(directUrl);
  } else if (dashboardUrl) {
    // Subsequent session — print full dashboard URL with token
    console.log(`\n  Session "${cmd}" registered with hub.`);
    console.log(`  Dashboard: ${dashboardUrl}`);
    console.log("");
  } else if (!options.noQr) {
    const directUrl = `http://${ip}:${port}?token=${token}`;
    displayQR(directUrl);
  }

  // Prevent laptop from sleeping during session
  const sleepGuard = preventSleep();

  console.log(`  Server listening on ${host}:${port}`);
  console.log(`  Running: ${options.command.join(" ")}`);
  console.log(`  PID: ${ptyManager.pid}`);
  console.log(`  Sleep prevention: ${sleepGuard ? "active" : "unavailable"}`);
  console.log("");

  // Pipe local terminal I/O to/from the PTY
  // This lets the user interact with the agent locally too
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdin.setEncoding("utf-8");

  process.stdin.on("data", (data: string) => {
    ptyManager.write(data);
  });

  ptyManager.onData((data: string) => {
    process.stdout.write(data);
  });

  // Handle terminal resize
  function handleResize(): void {
    if (process.stdout.columns && process.stdout.rows) {
      ptyManager.resize(process.stdout.columns, process.stdout.rows);
      server.broadcastResize(process.stdout.columns, process.stdout.rows);
    }
  }

  process.stdout.on("resize", handleResize);
  handleResize();

  // Clean shutdown
  async function cleanup(): Promise<void> {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }

    // Stop heartbeat
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }

    // Unregister from hub
    if (registeredSession) {
      await unregisterSession(registeredSession.id);
    }

    sleepGuard?.kill();
    server.close();
    ptyManager.kill();
  }

  ptyManager.onExit(async (exitCode) => {
    console.log(`\n  Agent exited with code ${exitCode}`);
    await cleanup();
    process.exit(exitCode);
  });

  process.on("SIGINT", async () => {
    await cleanup();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await cleanup();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
