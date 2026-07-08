import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";
import { getItwillsyncHomeDir } from "@itwillsync/shared/paths";

const ENV_KEYS = ["ITWILLSYNC_CONFIG_DIR", "WSL_DISTRO_NAME", "APPDATA"] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("getItwillsyncHomeDir", () => {
  it("defaults to ~/.itwillsync when no overrides are set", () => {
    expect(getItwillsyncHomeDir()).toBe(join(homedir(), ".itwillsync"));
  });

  it("ITWILLSYNC_CONFIG_DIR always wins, even under WSL", () => {
    process.env.ITWILLSYNC_CONFIG_DIR = "/custom/dir";
    process.env.WSL_DISTRO_NAME = "Ubuntu";
    process.env.APPDATA = "C:\\Users\\me\\AppData\\Roaming";
    expect(getItwillsyncHomeDir()).toBe("/custom/dir");
  });

  it("redirects to the Windows-mounted AppData folder under WSL", () => {
    process.env.WSL_DISTRO_NAME = "Ubuntu";
    process.env.APPDATA = "C:\\Users\\me\\AppData\\Roaming";
    expect(getItwillsyncHomeDir()).toBe("/mnt/c/Users/me/AppData/Roaming/itwillsync");
  });

  it("falls back to the Linux home dir under WSL if APPDATA is missing", () => {
    process.env.WSL_DISTRO_NAME = "Ubuntu";
    expect(getItwillsyncHomeDir()).toBe(join(homedir(), ".itwillsync"));
  });

  it("falls back to the Linux home dir under WSL if APPDATA isn't a Windows path", () => {
    process.env.WSL_DISTRO_NAME = "Ubuntu";
    process.env.APPDATA = "/not/a/windows/path";
    expect(getItwillsyncHomeDir()).toBe(join(homedir(), ".itwillsync"));
  });

  it("ignores APPDATA when not running under WSL (e.g. native Windows)", () => {
    process.env.APPDATA = "C:\\Users\\me\\AppData\\Roaming";
    expect(getItwillsyncHomeDir()).toBe(join(homedir(), ".itwillsync"));
  });
});
