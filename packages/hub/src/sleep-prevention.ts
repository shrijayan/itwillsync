import { spawn, execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "node:fs";
import { join, resolve, isAbsolute } from "node:path";
import { homedir } from "node:os";

export interface SleepPreventionState {
  enabled: boolean;
  platform: string;
  enabledAt: number | null;
  error: string | null;
  supported: boolean;
}

interface FlagFileData {
  enabled: boolean;
  platform: string;
  enabledAt: number;
}

const SUPPORTED_PLATFORMS = new Set(["darwin", "win32", "linux"]);
const COMMAND_TIMEOUT_MS = 10_000;
const SYNC_TIMEOUT_MS = 5_000;

function getHubDir(): string {
  const envDir = process.env.ITWILLSYNC_CONFIG_DIR;
  if (envDir) {
    const resolved = resolve(envDir);
    if (!isAbsolute(resolved) || envDir.includes("..")) {
      throw new Error("Invalid ITWILLSYNC_CONFIG_DIR: must be an absolute path without traversal");
    }
    return resolved;
  }
  return join(homedir(), ".itwillsync");
}

export class SleepPrevention {
  private enabled = false;
  private enabledAt: number | null = null;
  private error: string | null = null;
  private busy = false;
  private readonly flagFilePath: string;
  private readonly platform: NodeJS.Platform;

  constructor() {
    this.platform = process.platform;
    this.flagFilePath = join(getHubDir(), "sleep-prevention.json");
    this.checkOrphanedFlag();
  }

  getState(): SleepPreventionState {
    return {
      enabled: this.enabled,
      platform: this.platform,
      enabledAt: this.enabledAt,
      error: this.error,
      supported: SUPPORTED_PLATFORMS.has(this.platform),
    };
  }

  async enable(password: string): Promise<{ success: boolean; error?: string }> {
    if (this.busy) {
      return { success: false, error: "Operation in progress" };
    }
    if (!SUPPORTED_PLATFORMS.has(this.platform)) {
      return { success: false, error: `Sleep prevention is not supported on ${this.platform}` };
    }
    if (this.enabled) {
      return { success: true };
    }

    this.busy = true;
    try {
      let result: { success: boolean; error?: string };

      switch (this.platform) {
        case "darwin":
          result = await this.runSudo(["pmset", "-a", "disablesleep", "1"], password);
          break;
        case "win32":
          result = await this.enableWindows();
          break;
        case "linux":
          result = await this.enableLinux(password);
          break;
        default:
          result = { success: false, error: "Unsupported platform" };
      }

      if (result.success) {
        this.enabled = true;
        this.enabledAt = Date.now();
        this.error = null;
        this.writeFlagFile();
      } else {
        this.error = result.error || "Unknown error";
      }

      return result;
    } finally {
      this.busy = false;
    }
  }

  /**
   * Disable sleep prevention. When `force` is true (user-initiated), the flag
   * file is always deleted. When false (orphan revert), the flag file persists
   * if the system command fails so the next restart can retry.
   */
  async disable(force = false): Promise<{ success: boolean; error?: string }> {
    if (this.busy) {
      return { success: false, error: "Operation in progress" };
    }
    if (!this.enabled) {
      return { success: true };
    }

    this.busy = true;
    try {
      let reverted = false;
      switch (this.platform) {
        case "darwin":
          reverted = (await this.runCommand("sudo", ["-n", "pmset", "-a", "disablesleep", "0"])).exitCode === 0;
          break;
        case "win32":
          await this.disableWindows();
          reverted = true;
          break;
        case "linux":
          reverted = await this.disableLinux();
          break;
      }

      this.enabled = false;
      this.enabledAt = null;
      this.error = null;

      if (reverted || force) {
        this.deleteFlagFile();
      }

      return { success: true };
    } finally {
      this.busy = false;
    }
  }

  /** Synchronous cleanup for SIGTERM/SIGINT handlers. Best-effort. */
  cleanupSync(): void {
    if (!this.enabled) return;

    try {
      switch (this.platform) {
        case "darwin":
          execFileSync("sudo", ["-n", "pmset", "-a", "disablesleep", "0"], {
            timeout: SYNC_TIMEOUT_MS,
            stdio: "ignore",
          });
          break;
        case "win32":
          execFileSync("powercfg", ["/setacvalueindex", "SCHEME_CURRENT", "SUB_BUTTONS", "LIDACTION", "1"], { timeout: SYNC_TIMEOUT_MS, stdio: "ignore" });
          execFileSync("powercfg", ["/setdcvalueindex", "SCHEME_CURRENT", "SUB_BUTTONS", "LIDACTION", "1"], { timeout: SYNC_TIMEOUT_MS, stdio: "ignore" });
          execFileSync("powercfg", ["/s", "SCHEME_CURRENT"], { timeout: SYNC_TIMEOUT_MS, stdio: "ignore" });
          break;
        case "linux":
          this.revertLogindConfSync();
          execFileSync("sudo", ["-n", "systemctl", "restart", "systemd-logind"], {
            timeout: SYNC_TIMEOUT_MS,
            stdio: "ignore",
          });
          break;
      }
    } catch {
      // Best-effort — setting reverts on reboot anyway
    }

    this.enabled = false;
    this.enabledAt = null;
    this.deleteFlagFile();
  }

  // --- Windows ---

  private async enableWindows(): Promise<{ success: boolean; error?: string }> {
    const commands: [string, string[]][] = [
      ["powercfg", ["/setacvalueindex", "SCHEME_CURRENT", "SUB_BUTTONS", "LIDACTION", "0"]],
      ["powercfg", ["/setdcvalueindex", "SCHEME_CURRENT", "SUB_BUTTONS", "LIDACTION", "0"]],
      ["powercfg", ["/s", "SCHEME_CURRENT"]],
    ];

    for (const [cmd, args] of commands) {
      const result = await this.runCommand(cmd, args);
      if (result.exitCode !== 0) {
        return { success: false, error: `powercfg failed: ${result.stderr || "requires admin privileges"}` };
      }
    }
    return { success: true };
  }

  private async disableWindows(): Promise<void> {
    await this.runCommand("powercfg", ["/setacvalueindex", "SCHEME_CURRENT", "SUB_BUTTONS", "LIDACTION", "1"]);
    await this.runCommand("powercfg", ["/setdcvalueindex", "SCHEME_CURRENT", "SUB_BUTTONS", "LIDACTION", "1"]);
    await this.runCommand("powercfg", ["/s", "SCHEME_CURRENT"]);
  }

  // --- Linux ---

  private async enableLinux(password: string): Promise<{ success: boolean; error?: string }> {
    const confPath = "/etc/systemd/logind.conf";
    const backupPath = join(getHubDir(), "logind.conf.backup");

    try {
      const readResult = await this.runSudo(["cat", confPath], password, { captureStdout: true });
      if (!readResult.success) {
        return { success: false, error: readResult.error || "Failed to read logind.conf" };
      }

      const original = readResult.stdout!;
      writeFileSync(backupPath, original, "utf-8");

      let modified = original;
      const settings: Record<string, string> = {
        HandleLidSwitch: "ignore",
        HandleLidSwitchExternalPower: "ignore",
        HandleLidSwitchDocked: "ignore",
      };

      for (const [key, value] of Object.entries(settings)) {
        const regex = new RegExp(`^#?\\s*${key}\\s*=.*$`, "m");
        if (regex.test(modified)) {
          modified = modified.replace(regex, `${key}=${value}`);
        } else {
          modified = modified.replace(/^\[Login\]/m, `[Login]\n${key}=${value}`);
        }
      }

      const writeResult = await this.runSudo(["tee", confPath], password, { stdin: modified });
      if (!writeResult.success) {
        return { success: false, error: "Failed to write logind.conf" };
      }

      const restartResult = await this.runSudo(["systemctl", "restart", "systemd-logind"], password);
      if (!restartResult.success) {
        try {
          const backup = readFileSync(backupPath, "utf-8");
          await this.runSudo(["tee", confPath], password, { stdin: backup });
          await this.runSudo(["systemctl", "restart", "systemd-logind"], password);
        } catch { /* best-effort restore */ }
        return { success: false, error: "Failed to restart systemd-logind" };
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  private async disableLinux(): Promise<boolean> {
    const backupPath = join(getHubDir(), "logind.conf.backup");
    if (!existsSync(backupPath)) return true;

    try {
      const backup = readFileSync(backupPath, "utf-8");
      const teeResult = await this.runCommand("sudo", ["-n", "tee", "/etc/systemd/logind.conf"], { stdin: backup });
      const restartResult = await this.runCommand("sudo", ["-n", "systemctl", "restart", "systemd-logind"]);
      const ok = teeResult.exitCode === 0 && restartResult.exitCode === 0;
      if (ok) unlinkSync(backupPath);
      return ok;
    } catch {
      return false;
    }
  }

  private revertLogindConfSync(): void {
    const backupPath = join(getHubDir(), "logind.conf.backup");
    if (!existsSync(backupPath)) return;

    try {
      const backup = readFileSync(backupPath, "utf-8");
      execFileSync("sudo", ["-n", "tee", "/etc/systemd/logind.conf"], {
        input: backup,
        timeout: SYNC_TIMEOUT_MS,
        stdio: ["pipe", "ignore", "ignore"],
      });
      unlinkSync(backupPath);
    } catch {
      // Best-effort
    }
  }

  // --- Helpers ---

  /** Run a command via sudo -S (password on stdin). Optionally pipe extra stdin or capture stdout. */
  private runSudo(
    args: string[],
    password: string,
    opts?: { stdin?: string; captureStdout?: boolean },
  ): Promise<{ success: boolean; stdout?: string; error?: string }> {
    return new Promise((resolve) => {
      const capture = opts?.captureStdout ?? false;
      const proc = spawn("sudo", ["-S", ...args], {
        stdio: ["pipe", capture ? "pipe" : "ignore", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      if (capture) proc.stdout!.on("data", (d: Buffer) => { stdout += d.toString(); });
      proc.stderr!.on("data", (d: Buffer) => { stderr += d.toString(); });

      const timer = setTimeout(() => {
        proc.kill("SIGKILL");
        resolve({ success: false, error: "Command timed out" });
      }, COMMAND_TIMEOUT_MS);

      proc.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve({ success: true, ...(capture && { stdout }) });
        } else {
          const msg = stderr.toLowerCase().includes("incorrect password")
            ? "Incorrect password"
            : stderr.trim() || `Command failed with exit code ${code}`;
          resolve({ success: false, error: msg });
        }
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        resolve({ success: false, error: err.message });
      });

      proc.stdin.write(password + "\n");
      if (opts?.stdin) proc.stdin.write(opts.stdin);
      proc.stdin.end();
    });
  }

  /** Run a command without sudo password. Optionally pipe stdin. */
  private runCommand(
    cmd: string,
    args: string[],
    opts?: { stdin?: string },
  ): Promise<{ exitCode: number; stderr: string }> {
    return new Promise((resolve) => {
      const hasStdin = opts?.stdin != null;
      const proc = spawn(cmd, args, {
        stdio: [hasStdin ? "pipe" : "ignore", "ignore", "pipe"],
      });

      let stderr = "";
      proc.stderr!.on("data", (d: Buffer) => { stderr += d.toString(); });

      const timer = setTimeout(() => {
        proc.kill("SIGKILL");
        resolve({ exitCode: 1, stderr: "Command timed out" });
      }, COMMAND_TIMEOUT_MS);

      proc.on("close", (code) => {
        clearTimeout(timer);
        resolve({ exitCode: code ?? 1, stderr });
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        resolve({ exitCode: 1, stderr: err.message });
      });

      if (hasStdin) {
        proc.stdin!.write(opts!.stdin);
        proc.stdin!.end();
      }
    });
  }

  private writeFlagFile(): void {
    const data: FlagFileData = {
      enabled: true,
      platform: this.platform,
      enabledAt: this.enabledAt || Date.now(),
    };
    try {
      writeFileSync(this.flagFilePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
    } catch {
      // Non-critical
    }
  }

  private deleteFlagFile(): void {
    try {
      if (existsSync(this.flagFilePath)) {
        unlinkSync(this.flagFilePath);
      }
    } catch {
      // Non-critical
    }
  }

  private checkOrphanedFlag(): void {
    try {
      if (!existsSync(this.flagFilePath)) return;

      const raw = readFileSync(this.flagFilePath, "utf-8");
      const data: FlagFileData = JSON.parse(raw);

      if (data.enabled) {
        console.log("Reverting orphaned sleep prevention setting...");
        this.enabled = true;
        this.enabledAt = data.enabledAt;
        // Don't force — flag persists if revert fails, so next restart retries
        this.disable().catch(() => {});
      }
    } catch {
      this.deleteFlagFile();
    }
  }
}
