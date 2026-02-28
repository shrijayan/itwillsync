import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { gzipSync } from "node:zlib";
import { WebSocketServer, type WebSocket } from "ws";
import type { PtyManager } from "./pty-manager.js";
import { validateToken } from "./auth.js";

/** MIME type mapping for static file serving. */
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

export interface SyncServerOptions {
  ptyManager: PtyManager;
  token: string;
  webClientPath: string;
  host: string;
  port: number;
}

export interface SyncServer {
  httpServer: ReturnType<typeof createServer>;
  wssServer: WebSocketServer;
  close(): void;
}

/** Extensions eligible for gzip compression. */
const COMPRESSIBLE = new Set([".html", ".js", ".css", ".json", ".svg"]);

/** In-memory cache for gzipped static files (populated on first request). */
const gzipCache = new Map<string, Buffer>();

/**
 * Serves a static file from the web client directory.
 * Applies gzip compression for text-based assets when the client supports it.
 * Returns 404 if the file is not found.
 */
async function serveStaticFile(
  webClientPath: string,
  filePath: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const fullPath = join(webClientPath, filePath);
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

/**
 * Creates the HTTP + WebSocket server for itwillsync.
 *
 * The HTTP server serves the static web client.
 * The WebSocket server handles authenticated terminal I/O forwarding.
 */
const PING_INTERVAL_MS = 30_000; // Send ping every 30s to keep connections alive
const PONG_TIMEOUT_MS = 10_000; // Close connection if no pong within 10s
const SCROLLBACK_BUFFER_SIZE = 50_000; // Characters to buffer for reconnecting clients

export function createSyncServer(options: SyncServerOptions): SyncServer {
  const { ptyManager, token, webClientPath, host, port } = options;
  const clients = new Set<WebSocket>();
  const aliveMap = new WeakMap<WebSocket, boolean>();

  // Scrollback buffer: stores recent PTY output so reconnecting clients can catch up
  let scrollbackBuffer = "";

  // --- HTTP Server ---
  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    let pathname = url.pathname;

    // Serve index.html for root
    if (pathname === "/") {
      pathname = "/index.html";
    }

    await serveStaticFile(webClientPath, pathname, req, res);
  });

  // --- WebSocket Server ---
  const wssServer = new WebSocketServer({ noServer: true });

  // Handle upgrade requests with token validation
  httpServer.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const providedToken = url.searchParams.get("token") || "";

    if (!validateToken(providedToken, token)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    wssServer.handleUpgrade(req, socket, head, (ws) => {
      wssServer.emit("connection", ws, req);
    });
  });

  // --- Keepalive Ping ---
  // Prevents routers/NAT from closing idle connections
  const pingInterval = setInterval(() => {
    for (const client of clients) {
      if (aliveMap.get(client) === false) {
        // No pong received since last ping — connection is dead
        client.terminate();
        clients.delete(client);
        continue;
      }
      aliveMap.set(client, false);
      client.ping();
    }
  }, PING_INTERVAL_MS);

  // Handle authenticated WebSocket connections
  wssServer.on("connection", (ws: WebSocket) => {
    clients.add(ws);
    aliveMap.set(ws, true);

    // Send buffered scrollback so reconnecting clients see recent output
    if (scrollbackBuffer.length > 0) {
      ws.send(scrollbackBuffer);
    }

    ws.on("pong", () => {
      aliveMap.set(ws, true);
    });

    ws.on("message", (raw: Buffer | string) => {
      try {
        const message = JSON.parse(typeof raw === "string" ? raw : raw.toString("utf-8"));

        if (message.type === "input" && typeof message.data === "string") {
          ptyManager.write(message.data);
        } else if (
          message.type === "resize" &&
          typeof message.cols === "number" &&
          typeof message.rows === "number"
        ) {
          ptyManager.resize(message.cols, message.rows);
        }
      } catch {
        // Malformed message; ignore silently
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
    });

    ws.on("error", () => {
      clients.delete(ws);
    });
  });

  // Forward PTY output to all connected WebSocket clients
  ptyManager.onData((data: string) => {
    // Buffer output for reconnecting clients
    scrollbackBuffer += data;
    if (scrollbackBuffer.length > SCROLLBACK_BUFFER_SIZE) {
      scrollbackBuffer = scrollbackBuffer.slice(-SCROLLBACK_BUFFER_SIZE);
    }

    for (const client of clients) {
      if (client.readyState === client.OPEN) {
        client.send(data);
      }
    }

  });

  // Start listening
  httpServer.listen(port, host);

  return {
    httpServer,
    wssServer,
    close() {
      // Stop keepalive pings
      clearInterval(pingInterval);

      // Close all WebSocket connections
      for (const client of clients) {
        client.close();
      }
      clients.clear();

      // Shut down servers
      wssServer.close();
      httpServer.close();
    },
  };
}
