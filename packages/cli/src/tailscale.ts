import { execFile } from "node:child_process";

export interface TailscaleStatus {
  installed: boolean;
  running: boolean;
  ip: string | null;
  hostname: string | null;
}

function execCommand(
  cmd: string,
  args: string[]
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 5000 }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      }
    });
  });
}

/**
 * Finds the tailscale binary path.
 * On macOS, the App Store install puts it in /Applications/Tailscale.app/...
 * On all platforms, the CLI install puts it in PATH as `tailscale`.
 */
function getTailscalePaths(): string[] {
  const paths = ["tailscale"];
  if (process.platform === "darwin") {
    paths.push("/Applications/Tailscale.app/Contents/MacOS/Tailscale");
  }
  return paths;
}

type ExecResult =
  | { status: "success"; stdout: string; stderr: string }
  | { status: "not_found" }
  | { status: "error"; error: Error };

async function tryExec(args: string[]): Promise<ExecResult> {
  let lastError: Error | null = null;

  for (const bin of getTailscalePaths()) {
    try {
      const result = await execCommand(bin, args);
      return { status: "success", ...result };
    } catch (err: any) {
      if (err.code === "ENOENT") {
        // Binary not found at this path, try next
        continue;
      }
      // Binary exists but command failed
      lastError = err;
    }
  }

  // If we got a non-ENOENT error from any path, binary is installed but failed
  if (lastError) {
    return { status: "error", error: lastError };
  }

  // All paths returned ENOENT — not installed
  return { status: "not_found" };
}

export async function getTailscaleStatus(): Promise<TailscaleStatus> {
  const result = await tryExec(["ip", "-4"]);

  if (result.status === "not_found") {
    return { installed: false, running: false, ip: null, hostname: null };
  }

  if (result.status === "error") {
    // Binary exists but command failed — installed but not running/connected
    return { installed: true, running: false, ip: null, hostname: null };
  }

  // Success — parse the IP
  const ip = result.stdout.split("\n")[0]?.trim();
  if (!ip || !/^100\./.test(ip)) {
    // Unexpected output — treat as not connected
    return { installed: true, running: false, ip: null, hostname: null };
  }

  // Got a valid Tailscale IP. Try to get hostname (nice-to-have).
  let hostname: string | null = null;
  try {
    const statusResult = await tryExec(["status", "--json"]);
    if (statusResult.status === "success") {
      const json = JSON.parse(statusResult.stdout);
      hostname = json?.Self?.HostName ?? null;
    }
  } catch {
    // hostname is optional
  }

  return { installed: true, running: true, ip, hostname };
}
