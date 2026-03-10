import { describe, it, expect } from "vitest";
import { resolveCommand } from "../resolve-command.js";

/**
 * Integration tests that run on real Windows — no mocks.
 * Skipped on non-Windows platforms (they pass through without calling where.exe).
 */
describe.skipIf(process.platform !== "win32")(
  "resolveCommand (Windows integration)",
  () => {
    it("resolves 'cmd' to a real path containing cmd.exe", async () => {
      const resolved = await resolveCommand("cmd");
      expect(resolved.toLowerCase()).toContain("cmd.exe");
      expect(resolved).toMatch(/^[a-zA-Z]:\\/);
    });

    it("resolves 'node' to a real path", async () => {
      const resolved = await resolveCommand("node");
      expect(resolved.toLowerCase()).toContain("node");
      expect(resolved).toMatch(/^[a-zA-Z]:\\/);
    });

    it("throws user-friendly error for nonexistent command", async () => {
      await expect(
        resolveCommand("nonexistent-command-xyz-12345")
      ).rejects.toThrow("Could not find");
    });

    it("passes through absolute paths unchanged", async () => {
      const absPath = "C:\\Windows\\System32\\cmd.exe";
      const resolved = await resolveCommand(absPath);
      expect(resolved).toBe(absPath);
    });
  }
);

describe.skipIf(process.platform === "win32")(
  "resolveCommand (non-Windows integration)",
  () => {
    it("passes through commands unchanged", async () => {
      const result = await resolveCommand("bash");
      expect(result).toBe("bash");
    });
  }
);
