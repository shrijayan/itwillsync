import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { request } from "node:http";
import { SessionRegistry } from "../registry.js";
import { createInternalApi } from "../internal-api.js";

const TEST_PORT = 19963; // Avoid conflict with real hub

function httpRequest(method: string, path: string, body?: object): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const req = request(
      {
        hostname: "127.0.0.1",
        port: TEST_PORT,
        path,
        method,
        headers: bodyStr
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(bodyStr) }
          : {},
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => { data += chunk; });
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode!, data: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode!, data });
          }
        });
      },
    );
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

describe("Internal API", () => {
  let registry: SessionRegistry;
  let api: ReturnType<typeof createInternalApi>;

  beforeAll(async () => {
    registry = new SessionRegistry();
    api = createInternalApi({ registry, port: TEST_PORT });
    // Wait for server to be ready
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  afterAll(() => {
    api.close();
    registry.stopHealthChecks();
  });

  describe("GET /api/health", () => {
    it("should return ok status", async () => {
      const { status, data } = await httpRequest("GET", "/api/health");
      expect(status).toBe(200);
      expect(data.status).toBe("ok");
      expect(data.sessions).toBe(0);
    });
  });

  describe("POST /api/sessions", () => {
    it("should register a session", async () => {
      const { status, data } = await httpRequest("POST", "/api/sessions", {
        name: "test-agent",
        port: 7964,
        token: "abc123",
        agent: "claude",
        cwd: "/home/user",
        pid: process.pid,
      });

      expect(status).toBe(201);
      expect(data.session).toBeDefined();
      expect(data.session.name).toBe("test-agent");
      expect(data.session.id).toBeTypeOf("string");
    });

    it("should reject missing required fields", async () => {
      const { status, data } = await httpRequest("POST", "/api/sessions", {
        name: "incomplete",
      });

      expect(status).toBe(400);
      expect(data.error).toContain("Missing required fields");
    });
  });

  describe("GET /api/sessions", () => {
    it("should list all sessions", async () => {
      const { status, data } = await httpRequest("GET", "/api/sessions");

      expect(status).toBe(200);
      expect(data.sessions).toBeInstanceOf(Array);
      expect(data.sessions.length).toBeGreaterThan(0);
    });
  });

  describe("DELETE /api/sessions/:id", () => {
    it("should unregister a session", async () => {
      // Register first
      const { data: regData } = await httpRequest("POST", "/api/sessions", {
        name: "to-delete",
        port: 7965,
        token: "def456",
        agent: "aider",
        cwd: "/tmp",
        pid: process.pid,
      });

      const sessionId = regData.session.id;

      // Delete
      const { status, data } = await httpRequest("DELETE", `/api/sessions/${sessionId}`);
      expect(status).toBe(200);
      expect(data.ok).toBe(true);
    });

    it("should return 404 for non-existent session", async () => {
      const { status } = await httpRequest("DELETE", "/api/sessions/nonexistent");
      expect(status).toBe(404);
    });
  });

  describe("unknown routes", () => {
    it("should return 404", async () => {
      const { status } = await httpRequest("GET", "/api/unknown");
      expect(status).toBe(404);
    });
  });
});
