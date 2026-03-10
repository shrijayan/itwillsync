import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../exec-utils.js", () => ({
  execFileAsync: vi.fn(),
}));

import { execFileAsync } from "../exec-utils.js";
import { getTailscaleStatus } from "../tailscale.js";

const mockExecFileAsync = vi.mocked(execFileAsync);

function simulateExec(
  behavior: "success" | "enoent" | "error",
  stdout = "",
  stderr = ""
) {
  if (behavior === "success") {
    mockExecFileAsync.mockResolvedValue({ stdout, stderr });
  } else if (behavior === "enoent") {
    const err = new Error("spawn tailscale ENOENT") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    mockExecFileAsync.mockRejectedValue(err);
  } else {
    const err = new Error("command failed") as NodeJS.ErrnoException;
    err.code = "1";
    mockExecFileAsync.mockRejectedValue(err);
  }
}

describe("getTailscaleStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns installed: false when binary not found (ENOENT)", async () => {
    simulateExec("enoent");

    const status = await getTailscaleStatus();

    expect(status.installed).toBe(false);
    expect(status.running).toBe(false);
    expect(status.ip).toBeNull();
  });

  it("returns installed: true, running: false when command fails", async () => {
    simulateExec("error");

    const status = await getTailscaleStatus();

    expect(status.installed).toBe(true);
    expect(status.running).toBe(false);
    expect(status.ip).toBeNull();
  });

  it("returns running: true with IP on success", async () => {
    // First call: tailscale ip -4
    mockExecFileAsync.mockResolvedValueOnce({
      stdout: "100.98.5.48\n",
      stderr: "",
    });
    // Second call: tailscale status --json (for hostname)
    mockExecFileAsync.mockResolvedValueOnce({
      stdout: JSON.stringify({ Self: { HostName: "my-laptop" } }),
      stderr: "",
    });

    const status = await getTailscaleStatus();

    expect(status.installed).toBe(true);
    expect(status.running).toBe(true);
    expect(status.ip).toBe("100.98.5.48");
    expect(status.hostname).toBe("my-laptop");
  });

  it("returns running: true with IP even if hostname fetch fails", async () => {
    // First call: tailscale ip -4 succeeds
    mockExecFileAsync.mockResolvedValueOnce({
      stdout: "100.64.0.1\n",
      stderr: "",
    });
    // Second call: tailscale status --json fails
    mockExecFileAsync.mockRejectedValueOnce(new Error("status failed"));

    const status = await getTailscaleStatus();

    expect(status.installed).toBe(true);
    expect(status.running).toBe(true);
    expect(status.ip).toBe("100.64.0.1");
    expect(status.hostname).toBeNull();
  });

  it("returns running: false when output has no valid Tailscale IP", async () => {
    simulateExec("success", "192.168.1.100\n");

    const status = await getTailscaleStatus();

    expect(status.installed).toBe(true);
    expect(status.running).toBe(false);
    expect(status.ip).toBeNull();
  });
});
