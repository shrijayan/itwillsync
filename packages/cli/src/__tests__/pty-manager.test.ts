import { describe, it, expect, afterEach } from "vitest";
import { PtyManager } from "../pty-manager.js";

// Use the running Node binary itself so these tests work identically on
// macOS, Linux, and Windows without depending on platform shell builtins
// (e.g. /bin/echo doesn't exist on Windows).
const NODE = process.execPath;

/** Wait for a condition to become true, polling every few ms. */
async function waitFor(check: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe("PtyManager", () => {
  let manager: PtyManager | null = null;

  afterEach(() => {
    manager?.kill();
    manager = null;
  });

  it("delivers output and exit to listeners registered immediately", async () => {
    manager = new PtyManager(NODE, ["-e", "process.stdout.write('hello'); process.exit(3);"]);

    let data = "";
    let exitCode: number | null = null;
    manager.onData((chunk) => { data += chunk; });
    manager.onExit((code) => { exitCode = code; });

    await waitFor(() => exitCode !== null);
    expect(data).toContain("hello");
    expect(exitCode).toBe(3);
  });

  it("does not lose the exit event when onExit() is registered after the process has already exited", async () => {
    // Exits essentially instantly — well under the ~20ms window where a
    // naive implementation (subscribing to node-pty only when onExit() is
    // called) silently drops the event.
    manager = new PtyManager(NODE, ["-e", "process.exit(7);"]);

    // Simulate the real CLI: other async work (e.g. `await registerSession()`)
    // happens before onExit() is ever called.
    await new Promise((r) => setTimeout(r, 100));

    let exitCode: number | null = null;
    manager.onExit((code) => { exitCode = code; });

    await waitFor(() => exitCode !== null, 500);
    expect(exitCode).toBe(7);
  });

  it("does not lose output printed before onData() is registered", async () => {
    manager = new PtyManager(NODE, ["-e", "process.stdout.write('early-output'); process.exit(0);"]);

    await new Promise((r) => setTimeout(r, 100));

    let data = "";
    let exited = false;
    manager.onData((chunk) => { data += chunk; });
    manager.onExit(() => { exited = true; });

    await waitFor(() => exited, 500);
    expect(data).toContain("early-output");
  });

  it("supports multiple onData listeners, each still receiving all data", async () => {
    manager = new PtyManager(NODE, ["-e", "process.stdout.write('multi'); process.exit(0);"]);

    let a = "";
    let b = "";
    manager.onData((chunk) => { a += chunk; });
    manager.onData((chunk) => { b += chunk; });

    await waitFor(() => a.includes("multi") && b.includes("multi"), 500);
    expect(a).toContain("multi");
    expect(b).toContain("multi");
  });

  it("clamps resize dimensions and ignores resize after exit", async () => {
    manager = new PtyManager(NODE, ["-e", "setTimeout(() => process.exit(0), 200);"]);

    manager.resize(9999, -5);
    expect(manager.cols).toBe(500);
    expect(manager.rows).toBe(1);

    let exited = false;
    manager.onExit(() => { exited = true; });
    await waitFor(() => exited, 1000);

    // Resizing (and killing) an already-exited process must not throw.
    expect(() => manager!.resize(80, 24)).not.toThrow();
    expect(() => manager!.kill()).not.toThrow();
  });
});
