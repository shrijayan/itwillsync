import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { gzipSync } from "node:zlib";
import { WebSocketServer, type WebSocket } from "ws";
import type { PtyManager } from "./pty-manager.js";
import type { SessionLogger } from "./session-logger.js";
import { validateToken } from "./auth.js";
import { deriveEncryptionKey, encrypt, decrypt } from "@itwillsync/shared/crypto";

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

export type ResizePolicy = "local-only" | "last-writer-wins";

export interface SyncServerOptions {
  ptyManager: PtyManager;
  token: string;
  webClientPath: string;
  host: string;
  port: number;
  resizePolicy?: ResizePolicy;
  scrollbackBufferSize?: number;
  clientBufferLimit?: number;
  logger?: SessionLogger;
}

export interface SyncServer {
  httpServer: ReturnType<typeof createServer>;
  wssServer: WebSocketServer;
  close(): void;
  /** Resize from the local terminal (always applied, broadcasts to web clients). */
  resizeFromLocal(cols: number, rows: number): void;
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
const PING_INTERVAL_MS = 30_000;
const DEFAULT_SCROLLBACK_SIZE = 10_485_760; // 10MB
const DEFAULT_CLIENT_BUFFER_LIMIT = 262_144; // 256KB

export function createSyncServer(options: SyncServerOptions): SyncServer {
  const {
    ptyManager, token, webClientPath, host, port,
    resizePolicy = "last-writer-wins",
    scrollbackBufferSize = DEFAULT_SCROLLBACK_SIZE,
    clientBufferLimit = DEFAULT_CLIENT_BUFFER_LIMIT,
    logger,
  } = options;
  const encryptionKey = deriveEncryptionKey(token);

  function sendMsg(ws: WebSocket, msg: object): void {
    ws.send(encrypt(JSON.stringify(msg), encryptionKey));
  }

  function broadcast(message: object): void {
    const msg = encrypt(JSON.stringify(message), encryptionKey);
    for (const client of clients) {
      if (client.readyState === client.OPEN) {
        client.send(msg);
      }
    }
  }

  const clients = new Set<WebSocket>();
  const aliveMap = new WeakMap<WebSocket, boolean>();
  const dropCounters = new WeakMap<WebSocket, number>();

  // Scrollback buffer: stores recent PTY output so reconnecting clients can catch up.
  // `seq` is a running character count — clients track it to request delta sync on reconnect.
  let scrollbackBuffer = "";
  let scrollbackBytes = 0;
  let seq = 0;

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

    // Client-initiated sync protocol: the client sends { type: "sync", lastSeq }
    // to request data. Backward compat: if no sync/resume arrives within 150ms,
    // auto-send full buffer for old clients that expect it.
    let syncReceived = false;
    const fallbackTimer = setTimeout(() => {
      if (!syncReceived && scrollbackBuffer.length > 0) {
        sendMsg(ws, { type: "data", data: scrollbackBuffer, seq });
      }
    }, 150);

    // Send current PTY dimensions immediately
    sendMsg(ws, { type: "resize", cols: ptyManager.cols, rows: ptyManager.rows });

    ws.on("pong", () => {
      aliveMap.set(ws, true);
    });

    ws.on("message", (raw: Buffer | string) => {
      let plaintext: string;
      try {
        const rawStr = typeof raw === "string" ? raw : raw.toString("utf-8");
        plaintext = decrypt(rawStr, encryptionKey);
      } catch {
        return; // Decryption failed — key mismatch or corrupted
      }
      try {
        const message = JSON.parse(plaintext);

        if (message.type === "input" && typeof message.data === "string") {
          ptyManager.write(message.data);
        } else if (
          message.type === "resize" &&
          typeof message.cols === "number" &&
          typeof message.rows === "number"
        ) {
          if (resizePolicy === "last-writer-wins") {
            ptyManager.resize(message.cols, message.rows);
            // Broadcast confirmed dimensions to ALL clients (including sender).
            // The sender needs confirmation because the server sent its old PTY
            // dims on connect, which the client may have already applied.
            broadcast({ type: "resize", cols: ptyManager.cols, rows: ptyManager.rows });
          }
        } else if (message.type === "sync" && typeof message.lastSeq === "number") {
          // Client-initiated sync protocol:
          // lastSeq === -1: fresh connection → send full scrollback
          // lastSeq >= 0:  reconnect → send only missed data (delta)
          syncReceived = true;
          clearTimeout(fallbackTimer);
          if (message.lastSeq === -1 || message.lastSeq < seq - scrollbackBuffer.length) {
            if (scrollbackBuffer.length > 0) {
              sendMsg(ws, { type: "data", data: scrollbackBuffer, seq });
            }
          } else {
            const missed = seq - message.lastSeq;
            if (missed > 0 && scrollbackBuffer.length > 0) {
              const delta = missed <= scrollbackBuffer.length
                ? scrollbackBuffer.slice(-missed)
                : scrollbackBuffer;
              sendMsg(ws, { type: "data", data: delta, seq });
            }
          }
        } else if (message.type === "resume" && typeof message.lastSeq === "number") {
          // Legacy resume handler for old clients
          syncReceived = true;
          clearTimeout(fallbackTimer);
          const missed = seq - message.lastSeq;
          if (missed > 0 && scrollbackBuffer.length > 0) {
            const delta = missed <= scrollbackBuffer.length
              ? scrollbackBuffer.slice(-missed)
              : scrollbackBuffer;
            sendMsg(ws, { type: "data", data: delta, seq });
          }
        }
      } catch {
        // Malformed JSON; ignore
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
    // Log to disk if logger is configured
    if (logger) logger.write(data);

    // Buffer output for reconnecting clients (byte-based trimming)
    seq += data.length;
    scrollbackBuffer += data;
    scrollbackBytes += Buffer.byteLength(data, "utf-8");
    if (scrollbackBytes > scrollbackBufferSize) {
      // Trim to ~half the limit to avoid trimming on every chunk.
      // Estimate the cut point using the average bytes-per-char ratio.
      const target = Math.floor(scrollbackBufferSize * 0.5);
      const excessBytes = scrollbackBytes - target;
      const avgBytesPerChar = scrollbackBytes / scrollbackBuffer.length;
      const trimChars = Math.min(Math.ceil(excessBytes / avgBytesPerChar), scrollbackBuffer.length);
      const trimmed = scrollbackBuffer.slice(0, trimChars);
      scrollbackBuffer = scrollbackBuffer.slice(trimChars);
      scrollbackBytes -= Buffer.byteLength(trimmed, "utf-8");
    }

    const msg = encrypt(JSON.stringify({ type: "data", data, seq }), encryptionKey);
    for (const client of clients) {
      if (client.readyState !== client.OPEN) continue;

      // Non-blocking: skip send if client's kernel buffer is full
      if (client.bufferedAmount > clientBufferLimit) {
        const count = (dropCounters.get(client) || 0) + 1;
        dropCounters.set(client, count);
        if (count === 100 || (count > 100 && count % 1000 === 0)) {
          console.warn(`  Warning: Dropped ${count} messages for slow client`);
        }
        continue;
      }

      client.send(msg);
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
    resizeFromLocal(cols: number, rows: number) {
      ptyManager.resize(cols, rows);
      broadcast({ type: "resize", cols: ptyManager.cols, rows: ptyManager.rows });
    },
  };
}
