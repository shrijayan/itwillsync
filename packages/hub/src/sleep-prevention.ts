import { spawn, execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
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

function getHubDir(): string {
  return process.env.ITWILLSYNC_CONFIG_DIR || join(homedir(), ".itwillsync");
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
          result = await this.enableDarwin(password);
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

  async disable(): Promise<{ success: boolean; error?: string }> {
    if (this.busy) {
      return { success: false, error: "Operation in progress" };
    }
    if (!this.enabled) {
      return { success: true };
    }

    this.busy = true;
    try {
      // Best-effort revert using non-interactive sudo (cached credentials)
      switch (this.platform) {
        case "darwin":
          await this.disableDarwin();
          break;
        case "win32":
          await this.disableWindows();
          break;
        case "linux":
          await this.disableLinux();
          break;
      }

      // Mark as disabled regardless of revert outcome
      this.enabled = false;
      this.enabledAt = null;
      this.error = null;
      this.deleteFlagFile();
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
            timeout: 5000,
            stdio: "ignore",
          });
          break;
        case "win32":
          execFileSync("powercfg", ["/setacvalueindex", "SCHEME_CURRENT", "SUB_BUTTONS", "LIDACTION", "1"], { timeout: 5000, stdio: "ignore" });
          execFileSync("powercfg", ["/setdcvalueindex", "SCHEME_CURRENT", "SUB_BUTTONS", "LIDACTION", "1"], { timeout: 5000, stdio: "ignore" });
          execFileSync("powercfg", ["/s", "SCHEME_CURRENT"], { timeout: 5000, stdio: "ignore" });
          break;
        case "linux":
          this.revertLogindConfSync();
          execFileSync("sudo", ["-n", "systemctl", "restart", "systemd-logind"], {
            timeout: 5000,
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

  // --- macOS ---

  private async enableDarwin(password: string): Promise<{ success: boolean; error?: string }> {
    return this.runSudo(["pmset", "-a", "disablesleep", "1"], password);
  }

  private async disableDarwin(): Promise<void> {
    await this.runCommand("sudo", ["-n", "pmset", "-a", "disablesleep", "0"]);
  }

  // --- Windows ---

  private async enableWindows(): Promise<{ success: boolean; error?: string }> {
    const commands = [
      ["powercfg", ["/setacvalueindex", "SCHEME_CURRENT", "SUB_BUTTONS", "LIDACTION", "0"]],
      ["powercfg", ["/setdcvalueindex", "SCHEME_CURRENT", "SUB_BUTTONS", "LIDACTION", "0"]],
      ["powercfg", ["/s", "SCHEME_CURRENT"]],
    ] as const;

    for (const [cmd, args] of commands) {
      const result = await this.runCommand(cmd, [...args]);
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
    // Read current logind.conf, back it up, then write modified version
    const confPath = "/etc/systemd/logind.conf";
    const backupPath = join(getHubDir(), "logind.conf.backup");

    try {
      // Read original via sudo
      const readResult = await this.runSudoCapture(["cat", confPath], password);
      if (!readResult.success) {
        return { success: false, error: readResult.error || "Failed to read logind.conf" };
      }

      const original = readResult.stdout;
      writeFileSync(backupPath, original, "utf-8");

      // Modify the config
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
          // Append under [Login] section
          modified = modified.replace(/^\[Login\]/m, `[Login]\n${key}=${value}`);
        }
      }

      // Write modified config via sudo tee
      const writeResult = await this.runSudoWithStdin(["tee", confPath], modified, password);
      if (!writeResult.success) {
        return { success: false, error: "Failed to write logind.conf" };
      }

      // Restart systemd-logind
      const restartResult = await this.runSudo(["systemctl", "restart", "systemd-logind"], password);
      if (!restartResult.success) {
        // Try to restore backup
        try {
          const backup = readFileSync(backupPath, "utf-8");
          await this.runSudoWithStdin(["tee", confPath], backup, password);
          await this.runSudo(["systemctl", "restart", "systemd-logind"], password);
        } catch {}
        return { success: false, error: "Failed to restart systemd-logind" };
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  private async disableLinux(): Promise<void> {
    const backupPath = join(getHubDir(), "logind.conf.backup");
    if (!existsSync(backupPath)) return;

    try {
      const backup = readFileSync(backupPath, "utf-8");
      await this.runSudoNonInteractiveWithStdin(["tee", "/etc/systemd/logind.conf"], backup);
      await this.runCommand("sudo", ["-n", "systemctl", "restart", "systemd-logind"]);
      unlinkSync(backupPath);
    } catch {
      // Best-effort
    }
  }

  private revertLogindConfSync(): void {
    const backupPath = join(getHubDir(), "logind.conf.backup");
    if (!existsSync(backupPath)) return;

    try {
      const backup = readFileSync(backupPath, "utf-8");
      execFileSync("sudo", ["-n", "tee", "/etc/systemd/logind.conf"], {
        input: backup,
        timeout: 5000,
        stdio: ["pipe", "ignore", "ignore"],
      });
      unlinkSync(backupPath);
    } catch {
      // Best-effort
    }
  }

  // --- Helpers ---

  private runSudo(args: string[], password: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const proc = spawn("sudo", ["-S", ...args], {
        stdio: ["pipe", "ignore", "pipe"],
      });

      let stderr = "";
      proc.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      const timer = setTimeout(() => {
        proc.kill("SIGKILL");
        resolve({ success: false, error: "Command timed out" });
      }, COMMAND_TIMEOUT_MS);

      proc.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve({ success: true });
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

      // Pipe password to sudo's stdin
      proc.stdin.write(password + "\n");
      proc.stdin.end();
    });
  }

  private runSudoCapture(args: string[], password: string): Promise<{ success: boolean; stdout: string; error?: string }> {
    return new Promise((resolve) => {
      const proc = spawn("sudo", ["-S", ...args], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });
      proc.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      const timer = setTimeout(() => {
        proc.kill("SIGKILL");
        resolve({ success: false, stdout: "", error: "Command timed out" });
      }, COMMAND_TIMEOUT_MS);

      proc.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve({ success: true, stdout });
        } else {
          resolve({ success: false, stdout: "", error: stderr.trim() || `Exit code ${code}` });
        }
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        resolve({ success: false, stdout: "", error: err.message });
      });

      proc.stdin.write(password + "\n");
      proc.stdin.end();
    });
  }

  private runSudoWithStdin(args: string[], input: string, password: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const proc = spawn("sudo", ["-S", ...args], {
        stdio: ["pipe", "ignore", "pipe"],
      });

      let stderr = "";
      proc.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      const timer = setTimeout(() => {
        proc.kill("SIGKILL");
        resolve({ success: false, error: "Command timed out" });
      }, COMMAND_TIMEOUT_MS);

      proc.on("close", (code) => {
        clearTimeout(timer);
        resolve(code === 0 ? { success: true } : { success: false, error: stderr.trim() || `Exit code ${code}` });
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        resolve({ success: false, error: err.message });
      });

      // Write password first, then the actual input
      proc.stdin.write(password + "\n");
      proc.stdin.write(input);
      proc.stdin.end();
    });
  }

  private runSudoNonInteractiveWithStdin(args: string[], input: string): Promise<void> {
    return new Promise((resolve) => {
      const proc = spawn("sudo", ["-n", ...args], {
        stdio: ["pipe", "ignore", "ignore"],
      });

      const timer = setTimeout(() => {
        proc.kill("SIGKILL");
        resolve();
      }, COMMAND_TIMEOUT_MS);

      proc.on("close", () => {
        clearTimeout(timer);
        resolve();
      });

      proc.on("error", () => {
        clearTimeout(timer);
        resolve();
      });

      proc.stdin.write(input);
      proc.stdin.end();
    });
  }

  private runCommand(cmd: string, args: string[]): Promise<{ exitCode: number; stderr: string }> {
    return new Promise((resolve) => {
      const proc = spawn(cmd, args, {
        stdio: ["ignore", "ignore", "pipe"],
      });

      let stderr = "";
      proc.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

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
        // Fire-and-forget async revert
        this.enabled = true;
        this.enabledAt = data.enabledAt;
        this.disable().catch(() => {});
      }
    } catch {
      // Corrupted flag file — delete it
      this.deleteFlagFile();
    }
  }
}
