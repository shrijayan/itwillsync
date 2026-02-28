import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mock AudioContext ---

function createMockGainNode() {
  return {
    gain: {
      value: 0,
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
  };
}

function createMockOscillator() {
  return {
    frequency: { value: 0 },
    type: "sine",
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
}

let lastMockCtx: ReturnType<typeof createMockAudioContextObj> | null = null;

function createMockAudioContextObj(state: AudioContextState = "running") {
  return {
    state,
    currentTime: 0,
    destination: {},
    resume: vi.fn(),
    createOscillator: vi.fn(() => createMockOscillator()),
    createGain: vi.fn(() => createMockGainNode()),
  };
}

let constructorSpy: ReturnType<typeof vi.fn>;

function installMockAudioContext(state: AudioContextState = "running") {
  const mockCtx = createMockAudioContextObj(state);
  lastMockCtx = mockCtx;
  constructorSpy = vi.fn();

  globalThis.AudioContext = class {
    state = mockCtx.state;
    currentTime = mockCtx.currentTime;
    destination = mockCtx.destination;
    resume = mockCtx.resume;
    createOscillator = mockCtx.createOscillator;
    createGain = mockCtx.createGain;
    constructor() {
      constructorSpy();
      // Copy mutable state reference so tests can mutate .state
      Object.defineProperty(this, "state", {
        get: () => mockCtx.state,
        set: (v) => { mockCtx.state = v; },
      });
    }
  } as unknown as typeof AudioContext;

  return mockCtx;
}

function installThrowingAudioContext() {
  constructorSpy = vi.fn();
  globalThis.AudioContext = class {
    constructor() {
      constructorSpy();
      throw new Error("AudioContext not supported");
    }
  } as unknown as typeof AudioContext;
}

// --- Helpers ---

function createElements() {
  const statusBar = document.createElement("div");
  const statusDot = document.createElement("div");
  const statusText = document.createElement("div");
  return { statusBar, statusDot, statusText };
}

// Re-import module fresh for each test to reset module-level state
async function importNotifications() {
  return await import("../notifications.js");
}

// --- Tests ---

describe("notifications", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    document.title = "itwillsync";
    lastMockCtx = null;

    installMockAudioContext();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // --- unlockAudio ---

  describe("unlockAudio", () => {
    it("creates AudioContext on first call", async () => {
      const { unlockAudio } = await importNotifications();

      unlockAudio();

      expect(constructorSpy).toHaveBeenCalledOnce();
    });

    it("is idempotent — second call does not create another AudioContext", async () => {
      const { unlockAudio } = await importNotifications();

      unlockAudio();
      unlockAudio();

      expect(constructorSpy).toHaveBeenCalledOnce();
    });

    it("resumes suspended AudioContext", async () => {
      const mockCtx = installMockAudioContext("suspended");

      const { unlockAudio } = await importNotifications();
      unlockAudio();

      expect(mockCtx.resume).toHaveBeenCalledOnce();
    });

    it("does not resume if AudioContext is already running", async () => {
      const mockCtx = installMockAudioContext("running");

      const { unlockAudio } = await importNotifications();
      unlockAudio();

      expect(mockCtx.resume).not.toHaveBeenCalled();
    });

    it("handles AudioContext constructor failure gracefully", async () => {
      installThrowingAudioContext();

      const { unlockAudio } = await importNotifications();

      expect(() => unlockAudio()).not.toThrow();
    });
  });

  // --- showNotification: sound ---

  describe("showNotification — sound", () => {
    it("creates two oscillators with correct frequencies when audio is unlocked", async () => {
      const mockCtx = installMockAudioContext();

      const { unlockAudio, showNotification, initNotifications } = await importNotifications();
      initNotifications(createElements());
      unlockAudio();
      showNotification("test");

      expect(mockCtx.createOscillator).toHaveBeenCalledTimes(2);
      expect(mockCtx.createGain).toHaveBeenCalledTimes(2);

      const osc1 = mockCtx.createOscillator.mock.results[0].value;
      const osc2 = mockCtx.createOscillator.mock.results[1].value;
      expect(osc1.frequency.value).toBe(587.33);
      expect(osc2.frequency.value).toBe(880);
    });

    it("does not crash when audio is not unlocked", async () => {
      const { showNotification, initNotifications } = await importNotifications();
      initNotifications(createElements());

      expect(() => showNotification("test")).not.toThrow();
      expect(constructorSpy).not.toHaveBeenCalled();
    });

    it("resumes suspended context before playing sound", async () => {
      const mockCtx = installMockAudioContext("running");

      const { unlockAudio, showNotification, initNotifications } = await importNotifications();
      initNotifications(createElements());
      unlockAudio();

      // Simulate phone sleep — context becomes suspended after unlock
      mockCtx.state = "suspended" as AudioContextState;
      showNotification("test");

      expect(mockCtx.resume).toHaveBeenCalled();
    });
  });

  // --- showNotification: visual ---

  describe("showNotification — visual", () => {
    it("adds .notify class to status bar and dot", async () => {
      const elements = createElements();
      const { initNotifications, showNotification } = await importNotifications();
      initNotifications(elements);

      showNotification("Agent needs your attention");

      expect(elements.statusBar.classList.contains("notify")).toBe(true);
      expect(elements.statusDot.classList.contains("notify")).toBe(true);
    });

    it("updates status text to notification message", async () => {
      const elements = createElements();
      const { initNotifications, showNotification } = await importNotifications();
      initNotifications(elements);

      showNotification("Agent needs your attention");

      expect(elements.statusText.textContent).toBe("Agent needs your attention");
    });

    it("starts title flash interval", async () => {
      const elements = createElements();
      const { initNotifications, showNotification } = await importNotifications();
      initNotifications(elements);

      showNotification("test");

      // After 1 second, title should change
      vi.advanceTimersByTime(1000);
      expect(document.title).toBe("\u26a0\ufe0f Agent needs you");

      // After another second, title should toggle back
      vi.advanceTimersByTime(1000);
      expect(document.title).toBe("itwillsync");
    });

    it("does not crash when called before initNotifications", async () => {
      const { showNotification } = await importNotifications();

      expect(() => showNotification("test")).not.toThrow();
    });
  });

  // --- recordUserActivity ---

  describe("recordUserActivity", () => {
    it("removes .notify class from status bar and dot", async () => {
      const elements = createElements();
      const { initNotifications, showNotification, recordUserActivity } = await importNotifications();
      initNotifications(elements);

      showNotification("test");
      expect(elements.statusBar.classList.contains("notify")).toBe(true);

      recordUserActivity();
      expect(elements.statusBar.classList.contains("notify")).toBe(false);
      expect(elements.statusDot.classList.contains("notify")).toBe(false);
    });

    it("restores status text to 'Connected'", async () => {
      const elements = createElements();
      const { initNotifications, showNotification, recordUserActivity } = await importNotifications();
      initNotifications(elements);

      showNotification("Agent needs your attention");
      expect(elements.statusText.textContent).toBe("Agent needs your attention");

      recordUserActivity();
      expect(elements.statusText.textContent).toBe("Connected");
    });

    it("clears title flash interval and restores title", async () => {
      const elements = createElements();
      const { initNotifications, showNotification, recordUserActivity } = await importNotifications();
      initNotifications(elements);

      showNotification("test");
      vi.advanceTimersByTime(1000);
      expect(document.title).toBe("\u26a0\ufe0f Agent needs you");

      recordUserActivity();
      expect(document.title).toBe("itwillsync");

      // Title should no longer toggle after clearing
      vi.advanceTimersByTime(5000);
      expect(document.title).toBe("itwillsync");
    });
  });

  // --- Edge cases ---

  describe("edge cases", () => {
    it("multiple rapid notifications clear previous title interval", async () => {
      const elements = createElements();
      const { initNotifications, showNotification } = await importNotifications();
      initNotifications(elements);

      showNotification("first");
      showNotification("second");
      showNotification("third");

      // Only one interval should be active — title toggles normally
      vi.advanceTimersByTime(1000);
      expect(document.title).toBe("\u26a0\ufe0f Agent needs you");

      vi.advanceTimersByTime(1000);
      expect(document.title).toBe("itwillsync");
    });

    it("recordUserActivity is safe to call without prior notification", async () => {
      const elements = createElements();
      const { initNotifications, recordUserActivity } = await importNotifications();
      initNotifications(elements);

      expect(() => recordUserActivity()).not.toThrow();
      expect(elements.statusText.textContent).toBe("Connected");
    });

    it("recordUserActivity is safe to call without initNotifications", async () => {
      const { recordUserActivity } = await importNotifications();

      expect(() => recordUserActivity()).not.toThrow();
    });
  });
});
