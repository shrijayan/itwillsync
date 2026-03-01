import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { SessionRegistry, SessionRegistration } from "./registry.js";

export interface InternalApiOptions {
  registry: SessionRegistry;
  port: number;
}

/**
 * Creates the internal localhost-only API server.
 * This API is used by CLI sessions to register/unregister with the hub.
 * Bound to 127.0.0.1 — not accessible from the network.
 */
export function createInternalApi(options: InternalApiOptions) {
  const { registry, port } = options;

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
    const pathname = url.pathname;

    // CORS headers for localhost
    res.setHeader("Content-Type", "application/json; charset=utf-8");

    try {
      // GET /api/health — hub health check
      if (req.method === "GET" && pathname === "/api/health") {
        res.writeHead(200);
        res.end(JSON.stringify({
          status: "ok",
          sessions: registry.size,
          uptime: process.uptime(),
        }));
        return;
      }

      // GET /api/sessions — list all sessions
      if (req.method === "GET" && pathname === "/api/sessions") {
        const sessions = registry.getAll().map((s) => ({
          id: s.id,
          name: s.name,
          port: s.port,
          token: s.token,
          agent: s.agent,
          cwd: s.cwd,
          pid: s.pid,
          connectedAt: s.connectedAt,
          lastSeen: s.lastSeen,
          status: s.status,
        }));
        res.writeHead(200);
        res.end(JSON.stringify({ sessions }));
        return;
      }

      // POST /api/sessions — register a new session
      if (req.method === "POST" && pathname === "/api/sessions") {
        const body = await readBody(req);
        const data = JSON.parse(body) as SessionRegistration;

        // Validate required fields
        if (!data.name || !data.port || !data.token || !data.agent || !data.pid) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "Missing required fields: name, port, token, agent, pid" }));
          return;
        }

        const session = registry.register(data);
        res.writeHead(201);
        res.end(JSON.stringify({ session }));
        return;
      }

      // DELETE /api/sessions/:id — unregister a session
      if (req.method === "DELETE" && pathname.startsWith("/api/sessions/")) {
        const id = pathname.slice("/api/sessions/".length);
        if (!id) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "Session ID required" }));
          return;
        }

        const removed = registry.unregister(id);
        if (removed) {
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true }));
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: "Session not found" }));
        }
        return;
      }

      // PUT /api/sessions/:id/heartbeat — session heartbeat
      if (req.method === "PUT" && pathname.match(/^\/api\/sessions\/[^/]+\/heartbeat$/)) {
        const id = pathname.split("/")[3];
        registry.updateLastSeen(id);
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      // POST /api/sessions/:id/stop — stop a session by killing its process
      if (req.method === "POST" && pathname.match(/^\/api\/sessions\/[^/]+\/stop$/)) {
        const id = pathname.split("/")[3];
        const session = registry.getById(id);
        if (!session) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: "Session not found" }));
          return;
        }

        try {
          process.kill(session.pid, "SIGTERM");
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true }));
        } catch {
          registry.unregister(id);
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true, note: "Process already terminated" }));
        }
        return;
      }

      // PUT /api/sessions/:id/rename — rename a session
      if (req.method === "PUT" && pathname.match(/^\/api\/sessions\/[^/]+\/rename$/)) {
        const id = pathname.split("/")[3];
        const body = await readBody(req);
        const data = JSON.parse(body);

        if (!data.name || typeof data.name !== "string") {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "Name is required" }));
          return;
        }

        const renamed = registry.rename(id, data.name.trim());
        if (renamed) {
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true, session: registry.getById(id) }));
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: "Session not found" }));
        }
        return;
      }

      // GET /api/sessions/:id — get session metadata
      if (req.method === "GET" && pathname.match(/^\/api\/sessions\/[^/]+$/) && !pathname.endsWith("/sessions")) {
        const id = pathname.split("/")[3];
        const session = registry.getById(id);
        if (!session) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: "Session not found" }));
          return;
        }

        // Collect memory usage (best-effort via execFile to avoid shell injection)
        let memoryKB = 0;
        try {
          const { execFileSync } = await import("node:child_process");
          const output = execFileSync("ps", ["-o", "rss=", "-p", String(session.pid)], {
            encoding: "utf-8",
            timeout: 2000,
          });
          memoryKB = parseInt(output.trim(), 10) || 0;
        } catch {
          // Process may not exist or ps unavailable
        }

        res.writeHead(200);
        res.end(JSON.stringify({
          session: {
            ...session,
            memoryKB,
            uptimeMs: Date.now() - session.connectedAt,
          },
        }));
        return;
      }

      // 404 for unknown routes
      res.writeHead(404);
      res.end(JSON.stringify({ error: "Not found" }));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  });

  // Bind to localhost only
  server.listen(port, "127.0.0.1");

  return {
    server,
    close() {
      server.close();
    },
  };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}
