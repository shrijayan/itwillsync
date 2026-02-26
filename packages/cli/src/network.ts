import { networkInterfaces } from "node:os";
import { createServer } from "node:net";

/**
 * Returns the first non-loopback, non-internal IPv4 address found
 * across all network interfaces.
 *
 * Cross-platform: interface names vary (en0 on macOS, eth0/wlan0 on Linux,
 * Ethernet/Wi-Fi on Windows), but os.networkInterfaces() normalizes them.
 *
 * Falls back to 127.0.0.1 if no suitable address is found.
 */
export function getLocalIP(): string {
  const interfaces = networkInterfaces();

  for (const addresses of Object.values(interfaces)) {
    if (!addresses) continue;

    for (const addr of addresses) {
      // Skip loopback, internal, and non-IPv4 addresses
      if (addr.family === "IPv4" && !addr.internal) {
        return addr.address;
      }
    }
  }

  return "127.0.0.1";
}

/**
 * Finds an available TCP port starting from `startPort`.
 * Tries to bind to the port; if it's busy (EADDRINUSE), increments and retries.
 * Returns a promise that resolves to the first available port.
 */
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
