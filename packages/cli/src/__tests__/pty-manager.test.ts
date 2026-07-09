import { describe, it, expect, afterEach } from "vitest";
import { PtyManager } from "../pty-manager.js";

// Use the running Node binary itself so these tests work identically on
// macOS, Linux, and Windows without depending on platform shell builtins
// (e.g. /bin/echo doesn't exist on Windows).
const NODE = process.execPath;

// Windows' ConPTY backend reports child-process exit noticeably later than
// a real Unix PTY does — on loaded CI runners the gap between "child called
// process.exit()" and node-pty's onExit firing can approach ~2s, vs. low
// single-digit ms on Linux/macOS. All timeouts below are sized generously
// (and identically across platforms, rather than branching on process.platform)
// so the same assertions are meaningful everywhere without flaking on Windows.
const DEFAULT_WAIT_MS = 4000;

/** Wait for a condition to become true, polling every few ms. */
async function waitFor(check: () => boolean, timeoutMs = DEFAULT_WAIT_MS): Promise<void> {
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
  }, DEFAULT_WAIT_MS + 1000);

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

    await waitFor(() => exitCode !== null);
    expect(exitCode).toBe(7);
  }, DEFAULT_WAIT_MS + 1000);

  it("does not lose output printed before onData() is registered", async () => {
    manager = new PtyManager(NODE, ["-e", "process.stdout.write('early-output'); process.exit(0);"]);

    await new Promise((r) => setTimeout(r, 100));

    let data = "";
    let exited = false;
    manager.onData((chunk) => { data += chunk; });
    manager.onExit(() => { exited = true; });

    await waitFor(() => exited);
    expect(data).toContain("early-output");
  }, DEFAULT_WAIT_MS + 1000);

  it("supports multiple onData listeners, each still receiving all data", async () => {
    manager = new PtyManager(NODE, ["-e", "process.stdout.write('multi'); process.exit(0);"]);

    let a = "";
    let b = "";
    manager.onData((chunk) => { a += chunk; });
    manager.onData((chunk) => { b += chunk; });

    await waitFor(() => a.includes("multi") && b.includes("multi"));
    expect(a).toContain("multi");
    expect(b).toContain("multi");
  }, DEFAULT_WAIT_MS + 1000);

  it("clamps resize dimensions and ignores resize after exit", async () => {
    manager = new PtyManager(NODE, ["-e", "setTimeout(() => process.exit(0), 200);"]);

    manager.resize(9999, -5);
    expect(manager.cols).toBe(500);
    expect(manager.rows).toBe(1);

    let exited = false;
    manager.onExit(() => { exited = true; });
    await waitFor(() => exited);

    // Resizing (and killing) an already-exited process must not throw.
    expect(() => manager!.resize(80, 24)).not.toThrow();
    expect(() => manager!.kill()).not.toThrow();
  }, DEFAULT_WAIT_MS + 1000);
});
