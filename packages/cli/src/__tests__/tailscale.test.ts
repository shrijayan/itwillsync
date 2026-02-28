import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock child_process before importing the module
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "node:child_process";
import { getTailscaleStatus } from "../tailscale.js";

const mockExecFile = vi.mocked(execFile);

function simulateExecFile(
  behavior: "success" | "enoent" | "error",
  stdout = "",
  stderr = ""
) {
  mockExecFile.mockImplementation(
    (_cmd: any, _args: any, _opts: any, callback: any) => {
      if (behavior === "enoent") {
        const err = new Error("spawn tailscale ENOENT") as any;
        err.code = "ENOENT";
        callback(err, "", "");
      } else if (behavior === "error") {
        const err = new Error("command failed") as any;
        err.code = 1;
        callback(err, "", stderr);
      } else {
        callback(null, stdout, stderr);
      }
      return {} as any;
    }
  );
}

describe("getTailscaleStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns installed: false when binary not found (ENOENT)", async () => {
    simulateExecFile("enoent");

    const status = await getTailscaleStatus();

    expect(status.installed).toBe(false);
    expect(status.running).toBe(false);
    expect(status.ip).toBeNull();
  });

  it("returns installed: true, running: false when command fails", async () => {
    simulateExecFile("error");

    const status = await getTailscaleStatus();

    expect(status.installed).toBe(true);
    expect(status.running).toBe(false);
    expect(status.ip).toBeNull();
  });

  it("returns running: true with IP on success", async () => {
    // First call: tailscale ip -4
    mockExecFile.mockImplementationOnce(
      (_cmd: any, _args: any, _opts: any, callback: any) => {
        callback(null, "100.98.5.48\n", "");
        return {} as any;
      }
    );
    // Second call: tailscale status --json (for hostname)
    mockExecFile.mockImplementationOnce(
      (_cmd: any, _args: any, _opts: any, callback: any) => {
        callback(
          null,
          JSON.stringify({ Self: { HostName: "my-laptop" } }),
          ""
        );
        return {} as any;
      }
    );

    const status = await getTailscaleStatus();

    expect(status.installed).toBe(true);
    expect(status.running).toBe(true);
    expect(status.ip).toBe("100.98.5.48");
    expect(status.hostname).toBe("my-laptop");
  });

  it("returns running: true with IP even if hostname fetch fails", async () => {
    // First call: tailscale ip -4 succeeds
    mockExecFile.mockImplementationOnce(
      (_cmd: any, _args: any, _opts: any, callback: any) => {
        callback(null, "100.64.0.1\n", "");
        return {} as any;
      }
    );
    // Second call: tailscale status --json fails
    mockExecFile.mockImplementationOnce(
      (_cmd: any, _args: any, _opts: any, callback: any) => {
        callback(new Error("status failed"), "", "");
        return {} as any;
      }
    );

    const status = await getTailscaleStatus();

    expect(status.installed).toBe(true);
    expect(status.running).toBe(true);
    expect(status.ip).toBe("100.64.0.1");
    expect(status.hostname).toBeNull();
  });

  it("returns running: false when output has no valid Tailscale IP", async () => {
    simulateExecFile("success", "192.168.1.100\n");

    const status = await getTailscaleStatus();

    expect(status.installed).toBe(true);
    expect(status.running).toBe(false);
    expect(status.ip).toBeNull();
  });
});
