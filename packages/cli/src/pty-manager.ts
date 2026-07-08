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
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined
    )
  );
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

  // node-pty fires onData/onExit the instant they happen — even if nothing
  // has called onData()/onExit() on this class yet. A command that exits
  // fast (typo'd binary, immediate crash) can exit in under 20ms, which is
  // faster than the `await registerSession()` hub round-trip that runs
  // before index.ts registers onExit(). Without buffering, that exit (and
  // any output printed right before it, e.g. the actual error message) is
  // silently dropped forever and the CLI hangs. Subscribing here in the
  // constructor — before any consumer has a chance to call onData/onExit —
  // and replaying to whichever listener registers later closes that gap.
  private dataBuffer: string[] = [];
  private dataListeners: Array<(data: string) => void> = [];
  private exitResult: { exitCode: number; signal?: number } | null = null;
  private exitListeners: Array<(exitCode: number, signal?: number) => void> = [];

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

    this.ptyProcess.onData((data) => {
      if (this.dataListeners.length > 0) {
        for (const listener of this.dataListeners) listener(data);
      } else {
        this.dataBuffer.push(data);
      }
    });

    this.ptyProcess.onExit(({ exitCode, signal }) => {
      this.exitResult = { exitCode, signal };
      for (const listener of this.exitListeners) listener(exitCode, signal);
    });
  }

  /**
   * Register a callback for PTY output data.
   * Replays any data received before this call, so a late registration
   * (e.g. after an async hub round-trip) never misses early output.
   */
  onData(callback: (data: string) => void): void {
    if (this.dataBuffer.length > 0) {
      const buffered = this.dataBuffer;
      this.dataBuffer = [];
      for (const data of buffered) callback(data);
    }
    this.dataListeners.push(callback);
  }

  /**
   * Register a callback for when the PTY process exits.
   * Fires immediately if the process already exited before this call, so a
   * late registration never misses a fast exit.
   */
  onExit(callback: (exitCode: number, signal?: number) => void): void {
    if (this.exitResult) {
      callback(this.exitResult.exitCode, this.exitResult.signal);
      return;
    }
    this.exitListeners.push(callback);
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
      const clampedCols = Math.max(1, Math.min(500, Math.floor(cols)));
      const clampedRows = Math.max(1, Math.min(200, Math.floor(rows)));
      this.ptyProcess.resize(clampedCols, clampedRows);
      this._cols = clampedCols;
      this._rows = clampedRows;
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
