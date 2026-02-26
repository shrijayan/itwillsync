import * as pty from "node-pty";

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

export class PtyManager {
  private ptyProcess: pty.IPty;

  /** The process ID of the spawned PTY process. */
  readonly pid: number;

  constructor(command: string, args: string[]) {
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
