import { networkInterfaces } from "node:os";
import { createServer } from "node:net";
import { getTailscaleStatus } from "./tailscale.js";
import type { NetworkingMode } from "./config.js";

const VIRTUAL_INTERFACE_PREFIXES = [
  "utun", "tun", "tap", "wg",  // VPN/tunnel
  "tailscale",                   // Tailscale
  "docker", "br-", "veth",      // Docker
  "virbr", "vboxnet", "vmnet",  // VM
];

function isVirtualInterface(name: string): boolean {
  return VIRTUAL_INTERFACE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/**
 * Returns the first non-loopback, non-internal IPv4 address found
 * on a physical network interface (skipping VPN/tunnel/VM interfaces).
 *
 * Falls back to a virtual interface IP, then 127.0.0.1.
 */
export function getLocalIP(): string {
  const interfaces = networkInterfaces();
  let fallback: string | null = null;

  for (const [name, addresses] of Object.entries(interfaces)) {
    if (!addresses) continue;

    for (const addr of addresses) {
      if (addr.family !== "IPv4" || addr.internal) continue;

      if (!isVirtualInterface(name)) {
        return addr.address;
      }
      fallback ??= addr.address;
    }
  }

  return fallback ?? "127.0.0.1";
}

/**
 * Finds an available TCP port starting from `startPort`.
 * Tries to bind to the port; if it's busy (EADDRINUSE), increments and retries.
 * Returns a promise that resolves to the first available port.
 */
/**
 * Resolves the IP address to use based on the networking mode.
 * Tailscale mode auto-detects the Tailscale IP; falls back to local with a warning.
 */
export async function resolveSessionIP(
  mode: NetworkingMode,
  isLocalhost: boolean
): Promise<string> {
  if (isLocalhost) return "127.0.0.1";

  if (mode === "tailscale") {
    const status = await getTailscaleStatus();
    if (!status.running || !status.ip) {
      console.warn(
        "\n  \u26A0 Tailscale is not running. Falling back to local WiFi.\n"
      );
      return getLocalIP();
    }
    return status.ip;
  }

  return getLocalIP();
}

export function findAvailablePort(startPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once("error", (err: NodeJS.ErrnoException) => {
      server.close();
      if (err.code === "EADDRINUSE") {
        // Port is busy, try the next one
        resolve(findAvailablePort(startPort + 1));
      } else {
        reject(err);
      }
    });

    server.listen(startPort, "0.0.0.0", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : startPort;
      server.close(() => {
        resolve(port);
      });
    });
  });
}
