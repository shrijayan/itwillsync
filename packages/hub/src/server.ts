import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { gzipSync } from "node:zlib";
import { WebSocketServer, type WebSocket } from "ws";
import { validateToken, RateLimiter } from "./auth.js";
import type { SessionRegistry } from "./registry.js";
import type { PreviewCollector } from "./preview-collector.js";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const COMPRESSIBLE = new Set([".html", ".js", ".css", ".json", ".svg"]);
const PING_INTERVAL_MS = 30_000;

export interface DashboardServerOptions {
  registry: SessionRegistry;
  masterToken: string;
  dashboardPath: string;
  host: string;
  port: number;
  previewCollector?: PreviewCollector;
}

/**
 * Creates the external dashboard server.
 * Serves the dashboard web UI and provides a WebSocket for real-time session updates.
 * All requests are authenticated with the master token.
 */
export function createDashboardServer(options: DashboardServerOptions) {
  const { registry, masterToken, dashboardPath, host, port, previewCollector } = options;
  const clients = new Set<WebSocket>();
  const aliveMap = new WeakMap<WebSocket, boolean>();
  const gzipCache = new Map<string, Buffer>();
  const rateLimiter = new RateLimiter();

  function getClientIP(req: IncomingMessage): string {
    return req.socket.remoteAddress || "unknown";
  }

  // --- HTTP Server ---
  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const providedToken = url.searchParams.get("token") || "";
    const ip = getClientIP(req);

    let pathname = url.pathname;
    if (pathname === "/") {
      pathname = "/index.html";
    }

    // Static assets (JS, CSS, images) are served without token validation.
    // These are bundled build artifacts with no sensitive data.
    // Security is enforced on the WebSocket connection (which requires the token).
    const isStaticAsset = pathname.startsWith("/assets/");

    if (!isStaticAsset) {
      // Rate limiting check
      if (rateLimiter.isBlocked(ip)) {
        res.writeHead(429, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Too many failed attempts. Try again later." }));
        return;
      }

      // Token validation for HTML pages and API endpoints
      if (!validateToken(providedToken, masterToken)) {
        rateLimiter.recordFailure(ip);
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      rateLimiter.clearIP(ip);
    }

    // Serve API endpoints for dashboard
    if (pathname === "/api/sessions") {
      const sessions = registry.getAll().map((s) => ({
        id: s.id,
        name: s.name,
        port: s.port,
        token: s.token,
        agent: s.agent,
        cwd: s.cwd,
        status: s.status,
        connectedAt: s.connectedAt,
        lastSeen: s.lastSeen,
      }));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ sessions }));
      return;
    }

    await serveStaticFile(dashboardPath, pathname, req, res);
  });

  async function serveStaticFile(
    basePath: string,
    filePath: string,
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const fullPath = join(basePath, filePath);
    const ext = extname(fullPath);
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    try {
      const raw = await readFile(fullPath);
      const acceptsGzip = (req.headers["accept-encoding"] || "").includes("gzip");

      if (acceptsGzip && COMPRESSIBLE.has(ext)) {
        let compressed = gzipCache.get(fullPath);
        if (!compressed) {
          compressed = gzipSync(raw);
          gzipCache.set(fullPath, compressed);
        }
        res.writeHead(200, {
          "Content-Type": contentType,
          "Content-Encoding": "gzip",
          "Content-Length": compressed.length,
        });
        res.end(compressed);
      } else {
        res.writeHead(200, {
          "Content-Type": contentType,
          "Content-Length": raw.length,
        });
        res.end(raw);
      }
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    }
  }

  // --- WebSocket Server ---
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const providedToken = url.searchParams.get("token") || "";
    const ip = getClientIP(req);

    if (rateLimiter.isBlocked(ip)) {
      socket.write("HTTP/1.1 429 Too Many Requests\r\n\r\n");
      socket.destroy();
      return;
    }

    if (!validateToken(providedToken, masterToken)) {
      rateLimiter.recordFailure(ip);
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    rateLimiter.clearIP(ip);

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  // Keepalive pings
  const pingInterval = setInterval(() => {
    for (const client of clients) {
      if (aliveMap.get(client) === false) {
        client.terminate();
        clients.delete(client);
        continue;
      }
      aliveMap.set(client, false);
      client.ping();
    }
  }, PING_INTERVAL_MS);

  wss.on("connection", (ws: WebSocket) => {
    clients.add(ws);
    aliveMap.set(ws, true);

    // Send current session list
    const sessions = registry.getAll();
    ws.send(JSON.stringify({ type: "sessions", sessions }));

    // Send current preview state for all sessions
    if (previewCollector) {
      const previews = previewCollector.getAllPreviews();
      for (const [sessionId, lines] of previews) {
        if (lines.length > 0) {
          ws.send(JSON.stringify({ type: "preview", sessionId, lines }));
        }
      }
    }

    // Handle incoming messages from dashboard clients
    ws.on("message", async (raw: Buffer | string) => {
      try {
        const msg = JSON.parse(typeof raw === "string" ? raw : raw.toString("utf-8"));

        switch (msg.type) {
          case "stop-session": {
            const session = registry.getById(msg.sessionId);
            if (!session) {
              ws.send(JSON.stringify({ type: "operation-error", operation: "stop", sessionId: msg.sessionId, error: "Session not found" }));
              return;
            }
            try {
              process.kill(session.pid, "SIGTERM");
            } catch {
              registry.unregister(msg.sessionId);
            }
            break;
          }

          case "rename-session": {
            const renamed = registry.rename(msg.sessionId, msg.name?.trim());
            if (!renamed) {
              ws.send(JSON.stringify({ type: "operation-error", operation: "rename", sessionId: msg.sessionId, error: "Session not found" }));
            }
            break;
          }

          case "clear-attention": {
            const session = registry.getById(msg.sessionId);
            if (session && session.status === "attention") {
              registry.updateStatus(msg.sessionId, "active");
            }
            break;
          }

          case "get-metadata": {
            const session = registry.getById(msg.sessionId);
            if (!session) {
              ws.send(JSON.stringify({ type: "operation-error", operation: "metadata", sessionId: msg.sessionId, error: "Session not found" }));
              return;
            }

            let memoryKB = 0;
            try {
              const { execFileSync } = await import("node:child_process");
              const output = execFileSync("ps", ["-o", "rss=", "-p", String(session.pid)], {
                encoding: "utf-8",
                timeout: 2000,
              });
              memoryKB = parseInt(output.trim(), 10) || 0;
            } catch {
              // Best-effort
            }

            ws.send(JSON.stringify({
              type: "metadata",
              sessionId: msg.sessionId,
              metadata: {
                pid: session.pid,
                agent: session.agent,
                cwd: session.cwd,
                port: session.port,
                memoryKB,
                uptimeMs: Date.now() - session.connectedAt,
                connectedAt: session.connectedAt,
              },
            }));
            break;
          }
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on("pong", () => {
      aliveMap.set(ws, true);
    });

    ws.on("close", () => {
      clients.delete(ws);
    });

    ws.on("error", () => {
      clients.delete(ws);
    });
  });

  // Broadcast session updates to all connected dashboard clients
  function broadcast(message: object): void {
    const msg = JSON.stringify(message);
    for (const client of clients) {
      if (client.readyState === client.OPEN) {
        client.send(msg);
      }
    }
  }

  registry.on("session-added", (session) => {
    broadcast({ type: "session-added", session });
  });

  registry.on("session-removed", (sessionId) => {
    broadcast({ type: "session-removed", sessionId });
  });

  registry.on("session-updated", (session) => {
    broadcast({ type: "session-updated", session });
  });

  // Broadcast live preview data
  if (previewCollector) {
    previewCollector.on("preview-data", (sessionId, lines) => {
      broadcast({ type: "preview", sessionId, lines });
    });
  }

  // Start listening
  httpServer.listen(port, host);

  return {
    httpServer,
    wss,
    close() {
      clearInterval(pingInterval);
      for (const client of clients) {
        client.close();
      }
      clients.clear();
      wss.close();
      httpServer.close();
    },
  };
}
