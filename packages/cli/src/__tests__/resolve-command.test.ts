import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "node:child_process";
import { resolveCommand } from "../resolve-command.js";

const mockExecFile = vi.mocked(execFile);
const originalPlatform = process.platform;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  Object.defineProperty(process, "platform", { value: originalPlatform });
});

function setPlatform(platform: string) {
  Object.defineProperty(process, "platform", { value: platform });
}

function simulateWhere(
  behavior: "success" | "enoent" | "not-found",
  stdout = ""
) {
  mockExecFile.mockImplementation(
    (_cmd: any, _args: any, _opts: any, callback: any) => {
      if (behavior === "enoent") {
        const err = new Error("spawn where.exe ENOENT") as any;
        err.code = "ENOENT";
        callback(err, "", "");
      } else if (behavior === "not-found") {
        const err = new Error(
          "INFO: Could not find files for the given pattern(s)."
        ) as any;
        err.code = 1;
        callback(err, "", "");
      } else {
        callback(null, stdout, "");
      }
      return {} as any;
    }
  );
}

describe("resolveCommand", () => {
  describe("non-Windows (passthrough)", () => {
    it("returns command unchanged on Linux", async () => {
      setPlatform("linux");
      const result = await resolveCommand("claude");
      expect(result).toBe("claude");
      expect(mockExecFile).not.toHaveBeenCalled();
    });

    it("returns command unchanged on macOS", async () => {
      setPlatform("darwin");
      const result = await resolveCommand("claude");
      expect(result).toBe("claude");
      expect(mockExecFile).not.toHaveBeenCalled();
    });
  });

  describe("Windows", () => {
    beforeEach(() => {
      setPlatform("win32");
    });

    it("resolves command via where.exe", async () => {
      simulateWhere(
        "success",
        "C:\\Users\\admin\\AppData\\Roaming\\npm\\claude.cmd\r\n"
      );

      const result = await resolveCommand("claude");

      expect(result).toBe(
        "C:\\Users\\admin\\AppData\\Roaming\\npm\\claude.cmd"
      );
      expect(mockExecFile).toHaveBeenCalledWith(
        "where.exe",
        ["claude"],
        expect.objectContaining({ timeout: 5000 }),
        expect.any(Function)
      );
    });

    it("returns first match when where.exe finds multiple", async () => {
      simulateWhere(
        "success",
        "C:\\Users\\admin\\AppData\\Roaming\\npm\\claude.cmd\r\n" +
          "C:\\Program Files\\Claude\\claude.exe\r\n"
      );

      const result = await resolveCommand("claude");

      expect(result).toBe(
        "C:\\Users\\admin\\AppData\\Roaming\\npm\\claude.cmd"
      );
    });

    it("throws user-friendly error when command not found", async () => {
      simulateWhere("not-found");

      await expect(resolveCommand("nonexistent")).rejects.toThrow(
        'Could not find "nonexistent" on this system.'
      );
      await expect(resolveCommand("nonexistent")).rejects.toThrow("PATH");
    });

    it("passes through absolute paths without calling where.exe", async () => {
      const absPath = "C:\\Program Files\\Claude\\claude.exe";

      const result = await resolveCommand(absPath);

      expect(result).toBe(absPath);
      expect(mockExecFile).not.toHaveBeenCalled();
    });

    it("falls back gracefully if where.exe itself is not found", async () => {
      simulateWhere("enoent");

      const result = await resolveCommand("claude");

      expect(result).toBe("claude");
    });
  });
});
