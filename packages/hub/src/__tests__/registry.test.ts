import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SessionRegistry, type SessionRegistration } from "../registry.js";

function makeRegistration(overrides: Partial<SessionRegistration> = {}): SessionRegistration {
  return {
    name: "test-agent",
    port: 7964,
    token: "abc123",
    agent: "claude",
    cwd: "/home/user/project",
    pid: process.pid, // Use current process so health checks pass
    ...overrides,
  };
}

describe("SessionRegistry", () => {
  let registry: SessionRegistry;

  beforeEach(() => {
    registry = new SessionRegistry();
  });

  afterEach(() => {
    registry.stopHealthChecks();
  });

  describe("register", () => {
    it("should register a session and return it with an ID", () => {
      const session = registry.register(makeRegistration());

      expect(session.id).toBeTypeOf("string");
      expect(session.id.length).toBe(16); // 8 bytes hex
      expect(session.name).toBe("test-agent");
      expect(session.agent).toBe("claude");
      expect(session.port).toBe(7964);
      expect(session.connectedAt).toBeTypeOf("number");
      expect(session.status).toBe("active");
    });

    it("should assign unique IDs to different sessions", () => {
      const s1 = registry.register(makeRegistration({ name: "s1" }));
      const s2 = registry.register(makeRegistration({ name: "s2" }));

      expect(s1.id).not.toBe(s2.id);
    });

    it("should emit session-added event", () => {
      const handler = vi.fn();
      registry.on("session-added", handler);

      const session = registry.register(makeRegistration());

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(session);
    });
  });

  describe("unregister", () => {
    it("should remove a registered session", () => {
      const session = registry.register(makeRegistration());
      expect(registry.size).toBe(1);

      const removed = registry.unregister(session.id);
      expect(removed).toBe(true);
      expect(registry.size).toBe(0);
    });

    it("should return false for non-existent session", () => {
      expect(registry.unregister("nonexistent")).toBe(false);
    });

    it("should emit session-removed event", () => {
      const handler = vi.fn();
      registry.on("session-removed", handler);

      const session = registry.register(makeRegistration());
      registry.unregister(session.id);

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(session.id);
    });
  });

  describe("getAll", () => {
    it("should return empty array when no sessions", () => {
      expect(registry.getAll()).toEqual([]);
    });

    it("should return all registered sessions", () => {
      registry.register(makeRegistration({ name: "s1" }));
      registry.register(makeRegistration({ name: "s2" }));

      const all = registry.getAll();
      expect(all).toHaveLength(2);
      expect(all.map((s) => s.name)).toContain("s1");
      expect(all.map((s) => s.name)).toContain("s2");
    });
  });

  describe("getById", () => {
    it("should return the session by ID", () => {
      const session = registry.register(makeRegistration());
      const found = registry.getById(session.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(session.id);
    });

    it("should return undefined for non-existent ID", () => {
      expect(registry.getById("nonexistent")).toBeUndefined();
    });
  });

  describe("updateLastSeen", () => {
    it("should update lastSeen timestamp", () => {
      const session = registry.register(makeRegistration());
      const originalLastSeen = session.lastSeen;

      registry.updateLastSeen(session.id);

      const updated = registry.getById(session.id);
      expect(updated!.lastSeen).toBeGreaterThanOrEqual(originalLastSeen);
      expect(updated!.status).toBe("active");
    });
  });

  describe("updateStatus", () => {
    it("should update status and emit event", () => {
      const handler = vi.fn();
      registry.on("session-updated", handler);

      const session = registry.register(makeRegistration());
      registry.updateStatus(session.id, "attention");

      const updated = registry.getById(session.id);
      expect(updated!.status).toBe("attention");
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe("size", () => {
    it("should track the number of sessions", () => {
      expect(registry.size).toBe(0);

      const s1 = registry.register(makeRegistration({ name: "s1" }));
      expect(registry.size).toBe(1);

      registry.register(makeRegistration({ name: "s2" }));
      expect(registry.size).toBe(2);

      registry.unregister(s1.id);
      expect(registry.size).toBe(1);
    });
  });

  describe("clear", () => {
    it("should remove all sessions and emit events", () => {
      const handler = vi.fn();
      registry.on("session-removed", handler);

      registry.register(makeRegistration({ name: "s1" }));
      registry.register(makeRegistration({ name: "s2" }));
      registry.clear();

      expect(registry.size).toBe(0);
      expect(handler).toHaveBeenCalledTimes(2);
    });
  });
});
