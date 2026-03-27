import { spawn, execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

interface FlagFileData {
  rules: Array<{ name: string; port: number }>;
  createdAt: number;
}

const COMMAND_TIMEOUT_MS = 10_000;
const SYNC_TIMEOUT_MS = 5_000;
const RULE_PREFIX = "itwillsync";

function getHubDir(): string {
  return process.env.ITWILLSYNC_CONFIG_DIR || join(homedir(), ".itwillsync");
}

export class WindowsFirewall {
  private rules = new Map<string, number>();
  private readonly flagFilePath: string;
  private readonly isWindows: boolean;

  constructor() {
    this.isWindows = process.platform === "win32";
    this.flagFilePath = join(getHubDir(), "firewall-rules.json");
    if (this.isWindows) {
      this.checkOrphanedRules();
    }
  }

  async addRule(label: string, port: number): Promise<{ success: boolean; error?: string }> {
    if (!this.isWindows) return { success: true };

    // Sanitize label to prevent log/command injection
    const safeLabel = label.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 64);
    const ruleName = `${RULE_PREFIX}-${safeLabel}`;

    // Skip if already tracked
    if (this.rules.has(ruleName)) return { success: true };

    // Check if rule already exists in Windows Firewall
    if (await this.ruleExists(ruleName)) {
      this.rules.set(ruleName, port);
      this.writeFlagFile();
      return { success: true };
    }

    const result = await this.runNetsh([
      "advfirewall", "firewall", "add", "rule",
      `name=${ruleName}`,
      "dir=in",
      "action=allow",
      "protocol=TCP",
      `localport=${port}`,
    ]);

    if (result.exitCode === 0) {
      this.rules.set(ruleName, port);
      this.writeFlagFile();
      return { success: true };
    }

    console.warn(
      `  Warning: Could not add Windows Firewall rule for port ${port}.\n` +
      `  Phone access may be blocked. Run as Administrator or add the rule manually:\n` +
      `    netsh advfirewall firewall add rule name="${ruleName}" dir=in action=allow protocol=TCP localport=${port}`,
    );
    return { success: false, error: result.stderr || "Failed to add firewall rule" };
  }

  async removeRule(label: string): Promise<void> {
    if (!this.isWindows) return;

    const safeLabel = label.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 64);
    const ruleName = `${RULE_PREFIX}-${safeLabel}`;
    await this.runNetsh([
      "advfirewall", "firewall", "delete", "rule",
      `name=${ruleName}`,
    ]);
    this.rules.delete(ruleName);
    this.writeFlagFile();
  }

  cleanupSync(): void {
    if (!this.isWindows || this.rules.size === 0) return;

    for (const ruleName of this.rules.keys()) {
      try {
        execFileSync("netsh", [
          "advfirewall", "firewall", "delete", "rule",
          `name=${ruleName}`,
        ], { timeout: SYNC_TIMEOUT_MS, stdio: "ignore" });
      } catch {
        // Best-effort
      }
    }

    this.rules.clear();
    this.deleteFlagFile();
  }

  // --- Private helpers ---

  private async ruleExists(ruleName: string): Promise<boolean> {
    const result = await this.runNetsh([
      "advfirewall", "firewall", "show", "rule",
      `name=${ruleName}`,
    ]);
    return result.exitCode === 0;
  }

  private runNetsh(args: string[]): Promise<{ exitCode: number; stderr: string }> {
    return new Promise((resolve) => {
      const proc = spawn("netsh", args, {
        stdio: ["ignore", "ignore", "pipe"],
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
    });
  }

  private writeFlagFile(): void {
    if (this.rules.size === 0) {
      this.deleteFlagFile();
      return;
    }
    const data: FlagFileData = {
      rules: Array.from(this.rules.entries()).map(([name, port]) => ({ name, port })),
      createdAt: Date.now(),
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

  private checkOrphanedRules(): void {
    try {
      if (!existsSync(this.flagFilePath)) return;

      const raw = readFileSync(this.flagFilePath, "utf-8");
      const data: FlagFileData = JSON.parse(raw);

      if (data.rules && data.rules.length > 0) {
        console.log("Cleaning up orphaned firewall rules...");
        for (const rule of data.rules) {
          try {
            execFileSync("netsh", [
              "advfirewall", "firewall", "delete", "rule",
              `name=${rule.name}`,
            ], { timeout: SYNC_TIMEOUT_MS, stdio: "ignore" });
          } catch {
            // Best-effort
          }
        }
      }

      this.deleteFlagFile();
    } catch {
      this.deleteFlagFile();
    }
  }
}
