import { PtyManager, getDefaultShell } from "./pty-manager.js";
import { generateToken } from "./auth.js";
import { findAvailablePort, resolveSessionIP } from "./network.js";
import { createSyncServer } from "./server.js";
import { displayQR } from "./qr.js";
import { configExists, loadConfig, type NetworkingMode } from "./config.js";
import { runSetupWizard } from "./wizard.js";
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

const DEFAULT_PORT = 3456;

export interface CliOptions {
  port: number;
  localhost: boolean;
  noQr: boolean;
  command: string[];
  subcommand: "setup" | null;
  tailscale: boolean;
  local: boolean;
}

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    port: DEFAULT_PORT,
    localhost: false,
    noQr: false,
    command: [],
    subcommand: null,
    tailscale: false,
    local: false,
  };

  const args = argv.slice(2);

  // Check for subcommand first
  if (args.length > 0 && args[0] === "setup") {
    options.subcommand = "setup";
    return options;
  }

  let i = 0;

  while (i < args.length) {
    const arg = args[i];

    if (arg === "--") {
      // Everything after -- is the command
      options.command = args.slice(i + 1);
      break;
    } else if (arg === "--port" && i + 1 < args.length) {
      options.port = parseInt(args[i + 1], 10);
      i += 2;
    } else if (arg === "--localhost") {
      options.localhost = true;
      i++;
    } else if (arg === "--tailscale") {
      options.tailscale = true;
      i++;
    } else if (arg === "--local") {
      options.local = true;
      i++;
    } else if (arg === "--no-qr") {
      options.noQr = true;
      i++;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg === "--version" || arg === "-v") {
      console.log("itwillsync v0.1.0");
      process.exit(0);
    } else {
      // If no -- separator, treat remaining args as the command
      options.command = args.slice(i);
      break;
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
itwillsync — Sync any terminal agent to your phone

Usage:
  itwillsync [options] -- <command> [args...]
  itwillsync [options] <command> [args...]
  itwillsync setup

Examples:
  itwillsync -- claude
  itwillsync -- aider --model gpt-4
  itwillsync bash
  itwillsync --port 8080 -- claude
  itwillsync --tailscale -- claude
  itwillsync setup

Commands:
  setup              Run the setup wizard (configure networking mode)

Options:
  --port <number>    Port to listen on (default: ${DEFAULT_PORT})
  --localhost         Bind to 127.0.0.1 only (no LAN access)
  --tailscale         Use Tailscale IP for this session
  --local             Use local network IP for this session
  --no-qr            Don't display QR code
  -h, --help         Show this help
  -v, --version      Show version
`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv);

  // Handle setup subcommand
  if (options.subcommand === "setup") {
    await runSetupWizard();
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

  // Generate auth token
  const token = generateToken();

  // Find available port
  const port = await findAvailablePort(options.port);
  const host = options.localhost ? "127.0.0.1" : "0.0.0.0";

  // Determine IP for the connection URL
  const ip = await resolveSessionIP(networkingMode, options.localhost);
  const url = `http://${ip}:${port}?token=${token}`;

  // Resolve path to the built web client
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const webClientPath = join(__dirname, "web-client");

  // Create PTY
  const ptyManager = new PtyManager(cmd, cmdArgs);

  // Create server
  const server = createSyncServer({
    ptyManager,
    token,
    webClientPath,
    host,
    port,
  });

  // Display connection info
  if (!options.noQr) {
    displayQR(url);
  } else {
    console.log(`\n  Connect at: ${url}\n`);
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
    }
  }

  process.stdout.on("resize", handleResize);
  handleResize();

  // Clean shutdown
  function cleanup(): void {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    sleepGuard?.kill();
    server.close();
    ptyManager.kill();
  }

  ptyManager.onExit((exitCode) => {
    console.log(`\n  Agent exited with code ${exitCode}`);
    cleanup();
    process.exit(exitCode);
  });

  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
