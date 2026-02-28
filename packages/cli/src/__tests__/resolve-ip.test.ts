import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../tailscale.js", () => ({
  getTailscaleStatus: vi.fn(),
}));

import { getTailscaleStatus } from "../tailscale.js";
import { resolveSessionIP, getLocalIP } from "../network.js";

const mockGetTailscaleStatus = vi.mocked(getTailscaleStatus);

describe("resolveSessionIP", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns "127.0.0.1" when isLocalhost is true regardless of mode', async () => {
    const ip = await resolveSessionIP("tailscale", true);
    expect(ip).toBe("127.0.0.1");
    // Should not even check Tailscale
    expect(mockGetTailscaleStatus).not.toHaveBeenCalled();
  });

  it("returns local IP when mode is local", async () => {
    const ip = await resolveSessionIP("local", false);
    const localIP = getLocalIP();
    expect(ip).toBe(localIP);
    expect(mockGetTailscaleStatus).not.toHaveBeenCalled();
  });

  it("returns Tailscale IP when mode is tailscale and Tailscale is running", async () => {
    mockGetTailscaleStatus.mockResolvedValue({
      installed: true,
      running: true,
      ip: "100.98.5.48",
      hostname: "my-laptop",
    });

    const ip = await resolveSessionIP("tailscale", false);
    expect(ip).toBe("100.98.5.48");
  });

  it("falls back to local IP when Tailscale is not running", async () => {
    mockGetTailscaleStatus.mockResolvedValue({
      installed: true,
      running: false,
      ip: null,
      hostname: null,
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ip = await resolveSessionIP("tailscale", false);
    const localIP = getLocalIP();

    expect(ip).toBe(localIP);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Tailscale is not running")
    );
    warnSpy.mockRestore();
  });

  it("falls back to local IP when Tailscale is not installed", async () => {
    mockGetTailscaleStatus.mockResolvedValue({
      installed: false,
      running: false,
      ip: null,
      hostname: null,
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ip = await resolveSessionIP("tailscale", false);
    const localIP = getLocalIP();

    expect(ip).toBe(localIP);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
