import { execFileAsync } from "./exec-utils.js";

/**
 * Resolves a command name to its full executable path on Windows.
 * On Unix, node-pty handles PATH resolution natively, so this is a no-op.
 *
 * Windows needs this because node-pty's ConPTY backend cannot find
 * commands via PATH — it needs the full path to the executable.
 * npm-installed CLI tools (like `claude`) are .cmd shims that
 * node-pty won't find by name alone.
 */
export async function resolveCommand(command: string): Promise<string> {
  if (process.platform !== "win32") {
    return command;
  }

  // Already a full path — no resolution needed
  // Check for Windows absolute paths (e.g. C:\..., \\server\share)
  if (/^[a-zA-Z]:[/\\]/.test(command) || command.startsWith("\\\\")) {
    return command;
  }

  try {
    const { stdout } = await execFileAsync("where.exe", [command]);
    // where.exe returns one match per line; take the first (highest priority)
    const firstMatch = stdout.split("\n")[0]?.trim();
    if (firstMatch) {
      return firstMatch;
    }
    throw new Error(`where.exe returned empty output for "${command}"`);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      // where.exe itself not found (extremely unlikely) — let node-pty try
      return command;
    }

    throw new Error(
      `Could not find "${command}" on this system.\n\n` +
        `To fix this:\n` +
        `  1. Make sure "${command}" is installed\n` +
        `  2. Open a new terminal and run: ${command} --version\n` +
        `  3. If that works, try running itwillsync again\n\n` +
        `If "${command}" was just installed, you may need to restart your\n` +
        `terminal so Windows can find it in your PATH.`,
      { cause: err },
    );
  }
}
