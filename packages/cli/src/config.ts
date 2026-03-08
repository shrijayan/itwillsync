import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type NetworkingMode = "local" | "tailscale";

export interface Config {
  networkingMode: NetworkingMode;
  scrollbackBufferSize?: number;
  maxSessions?: number;
  idleTimeoutMs?: number;
  logRetentionDays?: number;
  clientBufferLimit?: number;
  maxTerminalCols?: number;
  maxTerminalRows?: number;
}

const DEFAULT_CONFIG: Config = {
  networkingMode: "local",
  scrollbackBufferSize: 10_485_760,   // 10MB
  maxSessions: 20,
  idleTimeoutMs: 86_400_000,          // 24 hours
  logRetentionDays: 30,
  clientBufferLimit: 262_144,          // 256KB
  maxTerminalCols: 500,
  maxTerminalRows: 200,
};

export function getConfigDir(): string {
  return process.env.ITWILLSYNC_CONFIG_DIR || join(homedir(), ".itwillsync");
}

export function getConfigPath(): string {
  return join(getConfigDir(), "config.json");
}

export function configExists(): boolean {
  return existsSync(getConfigPath());
}

export function loadConfig(): Config {
  try {
    const raw = readFileSync(getConfigPath(), "utf-8");
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: Config): void {
  const dir = getConfigDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "config.json"),
    JSON.stringify(config, null, 2) + "\n",
    "utf-8"
  );
}
