import { describe, it, expect, vi } from "vitest";
import { parseArgs, DEFAULT_PORT } from "../cli-options.js";

// Helper: simulate argv as if node ran `itwillsync <...args>`
function argv(...args: string[]): string[] {
  return ["node", "itwillsync", ...args];
}

describe("parseArgs", () => {
  it("returns defaults when no args provided", () => {
    const opts = parseArgs(argv());
    expect(opts.port).toBe(DEFAULT_PORT);
    expect(opts.localhost).toBe(false);
    expect(opts.noQr).toBe(false);
    expect(opts.command).toEqual([]);
    expect(opts.subcommand).toBeNull();
    expect(opts.tailscale).toBe(false);
    expect(opts.local).toBe(false);
  });

  it("detects setup subcommand", () => {
    const opts = parseArgs(argv("setup"));
    expect(opts.subcommand).toBe("setup");
  });

  it("setup subcommand returns immediately without parsing further", () => {
    const opts = parseArgs(argv("setup", "--tailscale", "--port", "9999"));
    expect(opts.subcommand).toBe("setup");
    expect(opts.tailscale).toBe(false);
    expect(opts.port).toBe(DEFAULT_PORT);
  });

  it("parses --tailscale flag", () => {
    const opts = parseArgs(argv("--tailscale", "--", "claude"));
    expect(opts.tailscale).toBe(true);
    expect(opts.command).toEqual(["claude"]);
  });

  it("parses --local flag", () => {
    const opts = parseArgs(argv("--local", "--", "claude"));
    expect(opts.local).toBe(true);
    expect(opts.command).toEqual(["claude"]);
  });

  it("parses --port with value", () => {
    const opts = parseArgs(argv("--port", "8080", "--", "bash"));
    expect(opts.port).toBe(8080);
  });

  it("exits with an error on a non-numeric --port value", () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((() => {
      throw new Error("process.exit called");
    }) as unknown) as typeof process.exit);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => parseArgs(argv("--port", "abc", "--", "bash"))).toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid --port value"));

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("exits with an error on an out-of-range --port value", () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((() => {
      throw new Error("process.exit called");
    }) as unknown) as typeof process.exit);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => parseArgs(argv("--port", "99999", "--", "bash"))).toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("parses --localhost flag", () => {
    const opts = parseArgs(argv("--localhost", "--", "bash"));
    expect(opts.localhost).toBe(true);
  });

  it("parses --no-qr flag", () => {
    const opts = parseArgs(argv("--no-qr", "--", "bash"));
    expect(opts.noQr).toBe(true);
  });

  it("captures command after -- separator", () => {
    const opts = parseArgs(argv("--tailscale", "--", "aider", "--model", "gpt-4"));
    expect(opts.command).toEqual(["aider", "--model", "gpt-4"]);
  });

  it("captures command without -- separator", () => {
    const opts = parseArgs(argv("bash"));
    expect(opts.command).toEqual(["bash"]);
  });

  it("allows both --tailscale and --local to be set (validation happens in main)", () => {
    const opts = parseArgs(argv("--tailscale", "--local", "--", "bash"));
    expect(opts.tailscale).toBe(true);
    expect(opts.local).toBe(true);
  });

  it("handles multiple flags together", () => {
    const opts = parseArgs(
      argv("--tailscale", "--no-qr", "--port", "9000", "--", "claude")
    );
    expect(opts.tailscale).toBe(true);
    expect(opts.noQr).toBe(true);
    expect(opts.port).toBe(9000);
    expect(opts.command).toEqual(["claude"]);
  });

  it("parses --hub-info flag", () => {
    const opts = parseArgs(argv("--hub-info"));
    expect(opts.hubInfo).toBe(true);
    expect(opts.command).toEqual([]);
  });

  it("parses --hub-stop flag", () => {
    const opts = parseArgs(argv("--hub-stop"));
    expect(opts.hubStop).toBe(true);
  });

  it("parses --hub-status flag", () => {
    const opts = parseArgs(argv("--hub-status"));
    expect(opts.hubStatus).toBe(true);
  });

  it("defaults hub flags to false", () => {
    const opts = parseArgs(argv());
    expect(opts.hubInfo).toBe(false);
    expect(opts.hubStop).toBe(false);
    expect(opts.hubStatus).toBe(false);
  });
});
