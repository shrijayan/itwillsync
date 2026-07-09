import { homedir } from "node:os";
import { join, posix } from "node:path";

/**
 * Convert a Windows path (as returned by %APPDATA%) into its WSL mount-point
 * equivalent, e.g. "C:\\Users\\me\\AppData\\Roaming" -> "/mnt/c/Users/me/AppData/Roaming".
 * Returns null if the input doesn't look like a Windows path.
 */
function toWslMountPath(windowsPath: string): string | null {
  if (!/^[A-Za-z]:\\/.test(windowsPath)) return null;
  return windowsPath
    .replace(/^([A-Za-z]):\\/, (_, drive: string) => `/mnt/${drive.toLowerCase()}/`)
    .replace(/\\/g, "/");
}

/**
 * The single directory itwillsync uses for all local state: hub.json, hub.pid,
 * sessions.json, config.json, tool-history.json, sleep-prevention/firewall
 * flag files, and session logs.
 *
 * On native WSL2, `os.homedir()` resolves to the Linux-side home (e.g.
 * /home/me), but the CLI and the hub daemon can each be launched from either
 * the WSL shell or a Windows shell on the same machine — so both MUST agree
 * on one folder or they can't find each other's files. When running under
 * WSL, this resolves to the Windows-side AppData folder (mounted at
 * /mnt/c/...) instead, so state is visible no matter which side started
 * which process.
 *
 * Every part of itwillsync (cli and hub) must call this function rather than
 * reimplementing the `homedir()` fallback locally. This logic used to be
 * copy-pasted across 6 files, and only one of them had the WSL branch — which
 * meant the CLI and the hub daemon could silently disagree and look in two
 * different folders on WSL.
 */
export function getItwillsyncHomeDir(): string {
  if (process.env.ITWILLSYNC_CONFIG_DIR) return process.env.ITWILLSYNC_CONFIG_DIR;

  if (process.env.WSL_DISTRO_NAME && process.env.APPDATA) {
    const wslMountPath = toWslMountPath(process.env.APPDATA);
    // Always join with posix (forward-slash) semantics here: this branch
    // only ever means something as a WSL/Linux-side path, so it must stay
    // "/mnt/c/..." even if this code is ever exercised under a Windows
    // (backslash-path) build of Node — `join()` from "node:path" would
    // otherwise normalize separators to "\" on win32 and produce a broken,
    // unusable path.
    if (wslMountPath) return posix.join(wslMountPath, "itwillsync");
  }

  return join(homedir(), ".itwillsync");
}
