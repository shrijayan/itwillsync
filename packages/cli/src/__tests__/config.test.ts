import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  configExists,
  loadConfig,
  saveConfig,
  getConfigPath,
} from "../config.js";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "itwillsync-test-"));
  process.env.ITWILLSYNC_CONFIG_DIR = tempDir;
});

afterEach(() => {
  delete process.env.ITWILLSYNC_CONFIG_DIR;
  rmSync(tempDir, { recursive: true, force: true });
});

describe("config", () => {
  it("configExists returns false when no config file", () => {
    expect(configExists()).toBe(false);
  });

  it("configExists returns true after saveConfig", () => {
    saveConfig({ networkingMode: "local" });
    expect(configExists()).toBe(true);
  });

  it("saveConfig creates directory and writes JSON", () => {
    const { readFileSync } = require("node:fs");

    saveConfig({ networkingMode: "tailscale" });

    const raw = readFileSync(getConfigPath(), "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed).toEqual({ networkingMode: "tailscale" });
  });

  it("loadConfig returns saved config", () => {
    saveConfig({ networkingMode: "tailscale" });
    expect(loadConfig()).toEqual({ networkingMode: "tailscale" });
  });

  it("loadConfig returns default when file does not exist", () => {
    expect(loadConfig()).toEqual({ networkingMode: "local" });
  });

  it("loadConfig returns default when file contains invalid JSON", () => {
    mkdirSync(tempDir, { recursive: true });
    writeFileSync(getConfigPath(), "not valid json{{{", "utf-8");
    expect(loadConfig()).toEqual({ networkingMode: "local" });
  });

  it("saveConfig overwrites existing config", () => {
    saveConfig({ networkingMode: "local" });
    expect(loadConfig().networkingMode).toBe("local");

    saveConfig({ networkingMode: "tailscale" });
    expect(loadConfig().networkingMode).toBe("tailscale");
  });

  it("round-trip: save tailscale, load returns tailscale", () => {
    expect(configExists()).toBe(false);
    saveConfig({ networkingMode: "tailscale" });
    expect(configExists()).toBe(true);

    const config = loadConfig();
    expect(config.networkingMode).toBe("tailscale");
  });
});
