import * as pty from "node-pty";
import { chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Detects the user's default shell based on the platform.
 * - Windows: uses PowerShell if available, otherwise cmd.exe
 * - macOS/Linux: uses the SHELL env var, falling back to /bin/sh
 */
export function getDefaultShell(): string {
  if (process.platform === "win32") {
    return process.env.COMSPEC || "cmd.exe";
  }
  return process.env.SHELL || "/bin/sh";
}

/**
 * Builds environment variables for the PTY process.
 * Inherits the current process env and sets TERM for proper terminal behavior.
 */
function buildEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  // Set TERM for unix systems to enable color and cursor support
  if (process.platform !== "win32") {
    env["TERM"] = env["TERM"] || "xterm-256color";
  }
  return env;
}

/**
 * Ensures node-pty's spawn-helper binary has execute permissions.
 * This runs at startup instead of via a postinstall script to avoid
 * Socket.dev "install scripts" supply chain risk warnings.
 */
function ensureSpawnHelperPermissions(): void {
  if (process.platform === "win32") return;
  try {
    const ptyEntryUrl = import.meta.resolve("node-pty");
    const ptyDir = dirname(fileURLToPath(ptyEntryUrl));
    const helperPath = join(
      ptyDir,
      "..",
      "prebuilds",
      `${process.platform}-${process.arch}`,
      "spawn-helper"
    );
    chmodSync(helperPath, 0o755);
  } catch {
    // spawn-helper may not exist on all platforms; safe to ignore
  }
}

export class PtyManager {
  private ptyProcess: pty.IPty;
  private _cols: number = 80;
  private _rows: number = 24;

  get cols(): number { return this._cols; }
  get rows(): number { return this._rows; }

  /** The process ID of the spawned PTY process. */
  readonly pid: number;

  constructor(command: string, args: string[]) {
    ensureSpawnHelperPermissions();

    const useConpty = process.platform === "win32";

    this.ptyProcess = pty.spawn(command, args, {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd: process.cwd(),
      env: buildEnv(),
      // On Windows, use ConPTY for better compatibility
      ...(useConpty ? { useConpty: true } : {}),
    });

    this.pid = this.ptyProcess.pid;
  }

  /**
   * Register a callback for PTY output data.
   */
  onData(callback: (data: string) => void): void {
    this.ptyProcess.onData(callback);
  }

  /**
   * Register a callback for when the PTY process exits.
   */
  onExit(callback: (exitCode: number, signal?: number) => void): void {
    this.ptyProcess.onExit(({ exitCode, signal }) => {
      callback(exitCode, signal);
    });
  }

  /**
   * Write data to the PTY's stdin.
   */
  write(data: string): void {
    this.ptyProcess.write(data);
  }

  /**
   * Resize the PTY to the given dimensions.
   */
  resize(cols: number, rows: number): void {
    try {
      this.ptyProcess.resize(cols, rows);
      this._cols = cols;
      this._rows = rows;
    } catch {
      // Process may have already exited; ignore resize errors
    }
  }

  /**
   * Kill the PTY process.
   */
  kill(): void {
    try {
      this.ptyProcess.kill();
    } catch {
      // Process may have already exited; ignore kill errors
    }
  }
}
