import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import { createExtraKeys, applyModifiers, hasActiveModifier } from "./extra-keys";
import { initNotifications, unlockAudio, showNotification, recordUserActivity } from "./notifications";
import { ConnectionManager, type ConnectionState } from "./reconnect";

// --- DOM Elements ---
const terminalContainer = document.getElementById("terminal-container")!;
const extraKeysContainer = document.getElementById("extra-keys")!;
const statusDot = document.getElementById("status-dot")!;
const statusText = document.getElementById("status-text")!;

// --- Extract params from URL ---
const params = new URLSearchParams(window.location.search);
const token = params.get("token");
const hubUrl = params.get("hub");

if (!token) {
  statusText.textContent = "Error: No auth token in URL";
  throw new Error("Missing token parameter");
}

// --- Back button (shown when opened from hub dashboard) ---
const backBtn = document.getElementById("back-btn")!;
if (hubUrl) {
  backBtn.classList.remove("hidden");
  (backBtn as HTMLAnchorElement).href = hubUrl;
}

// --- Terminal Setup ---
const terminal = new Terminal({
  cursorBlink: true,
  fontSize: 14,
  fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", Menlo, Monaco, monospace',
  theme: {
    background: "#1a1a2e",
    foreground: "#e0e0e0",
    cursor: "#e94560",
    selectionBackground: "#0f346080",
    black: "#1a1a2e",
    red: "#e94560",
    green: "#2ecc71",
    yellow: "#f39c12",
    blue: "#3498db",
    magenta: "#9b59b6",
    cyan: "#1abc9c",
    white: "#e0e0e0",
    brightBlack: "#555577",
    brightRed: "#ff6b81",
    brightGreen: "#55efc4",
    brightYellow: "#ffeaa7",
    brightBlue: "#74b9ff",
    brightMagenta: "#a29bfe",
    brightCyan: "#81ecec",
    brightWhite: "#ffffff",
  },
  allowProposedApi: true,
});

const fitAddon = new FitAddon();
terminal.loadAddon(fitAddon);
terminal.open(terminalContainer);

// Try WebGL renderer for better performance
try {
  const webglAddon = new WebglAddon();
  webglAddon.onContextLoss(() => {
    webglAddon.dispose();
  });
  terminal.loadAddon(webglAddon);
} catch {
  // WebGL not available, fall back to canvas renderer
}

fitAddon.fit();

// --- Agent Attention Detection ---
// All handlers fire immediately. OSC 9 progress bars (data starting with "4;") are filtered out.

// 1. Standalone BEL (\x07)
terminal.onBell(() => {
  showNotification("Agent needs your attention");
});

// 2. OSC 9 (iTerm2) — skip progress bar updates (9;4;state;progress)
terminal.parser.registerOscHandler(9, (data) => {
  if (data.startsWith("4;")) return true; // progress bar, ignore
  showNotification("Agent needs your attention");
  return true;
});

// 3. Kitty (OSC 99)
terminal.parser.registerOscHandler(99, () => {
  showNotification("Agent needs your attention");
  return true;
});

// 4. Ghostty (OSC 777)
terminal.parser.registerOscHandler(777, () => {
  showNotification("Agent needs your attention");
  return true;
});

// --- WebSocket Connection ---
let reconnectOverlay: HTMLElement | null = null;
let endedTimer: ReturnType<typeof setTimeout> | null = null;
let lastSeq = -1;

/** How long to keep reconnecting before declaring "session ended" (ms). */
const SESSION_ENDED_TIMEOUT = 15_000;

function getWsUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}?token=${token}`;
}

function createReconnectOverlay(): HTMLElement {
  const overlay = document.createElement("div");
  overlay.id = "reconnect-overlay";

  const spinner = document.createElement("div");
  spinner.className = "spinner";
  overlay.appendChild(spinner);

  const text = document.createElement("div");
  text.className = "reconnect-text";
  text.textContent = "Reconnecting...";
  overlay.appendChild(text);

  // Show "Back to Dashboard" button if opened from hub
  if (hubUrl) {
    const link = document.createElement("a");
    link.className = "reconnect-dashboard-btn";
    link.href = hubUrl;
    link.textContent = "\u2190 Back to Dashboard";
    overlay.appendChild(link);
  }

  return overlay;
}

function showSessionEnded(): void {
  if (!reconnectOverlay) return;

  // Stop reconnecting
  connection.destroy();

  // Update overlay to "ended" state
  reconnectOverlay.classList.add("ended");

  const spinner = reconnectOverlay.querySelector(".spinner");
  if (spinner) spinner.remove();

  const text = reconnectOverlay.querySelector(".reconnect-text");
  if (text) text.textContent = "Session ended";

  // Make the dashboard button more prominent
  const btn = reconnectOverlay.querySelector(".reconnect-dashboard-btn");
  if (btn) btn.classList.add("primary");
}

function setStatus(state: ConnectionState, attempts: number): void {
  statusDot.className = state === "connected" ? "connected" : state === "reconnecting" ? "reconnecting" : "";
  statusText.textContent =
    state === "connected"
      ? "Connected"
      : state === "reconnecting"
        ? attempts > 5
          ? "Waiting for laptop to wake up..."
          : `Reconnecting (attempt ${attempts})...`
        : "Disconnected";

  // Manage reconnect overlay
  if (state === "reconnecting" && !reconnectOverlay) {
    reconnectOverlay = createReconnectOverlay();
    document.body.appendChild(reconnectOverlay);

    // Start "session ended" countdown
    if (endedTimer) clearTimeout(endedTimer);
    endedTimer = setTimeout(showSessionEnded, SESSION_ENDED_TIMEOUT);
  } else if (state === "connected" && reconnectOverlay) {
    reconnectOverlay.remove();
    reconnectOverlay = null;

    // Cancel "session ended" countdown
    if (endedTimer) {
      clearTimeout(endedTimer);
      endedTimer = null;
    }
  }
}

const connection = new ConnectionManager({
  getUrl: getWsUrl,
  onOpen: () => {
    // Request delta sync if we have a previous sequence number
    if (lastSeq >= 0) {
      connection.send(JSON.stringify({ type: "resume", lastSeq }));
    }
    sendResize();
  },
  onMessage: (event) => {
    try {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case "data":
          terminal.write(msg.data);
          if (typeof msg.seq === "number") {
            lastSeq = msg.seq;
          }
          break;
        // Future message types (notifications, permissions, etc.) go here
      }
    } catch {
      // Raw string fallback (backward compat with older servers)
      terminal.write(typeof event.data === "string" ? event.data : new Uint8Array(event.data as ArrayBuffer));
    }
  },
  onStatusChange: setStatus,
});

function sendResize(): void {
  connection.send(JSON.stringify({
    type: "resize",
    cols: terminal.cols,
    rows: terminal.rows,
  }));
}

// --- Send input to server ---
function sendInput(data: string): void {
  connection.send(JSON.stringify({
    type: "input",
    data,
  }));
}

// --- Terminal Input → WebSocket (with modifier intercept) ---
terminal.onData((data: string) => {
  // If CTRL or ALT is armed, apply modifier to the soft keyboard input
  const modified = hasActiveModifier() ? applyModifiers(data) : data;
  sendInput(modified);
  recordUserActivity();
});

// --- Extra Keys Toolbar ---
createExtraKeys(extraKeysContainer, sendInput);

// --- Handle Resize + Keyboard Detection ---

// Track keyboard height so extra keys bar floats above it
let lastKeyboardHeight = 0;

function updateLayout(): void {
  const vv = window.visualViewport;
  const extraKeysBarHeight = extraKeysContainer.offsetHeight;

  if (vv) {
    // The keyboard height = full window height - visible viewport height - viewport offset
    // When keyboard is open, visualViewport.height shrinks
    const keyboardHeight = window.innerHeight - vv.height - vv.offsetTop;
    lastKeyboardHeight = Math.max(0, keyboardHeight);

    // Position extra keys bar just above the keyboard
    extraKeysContainer.style.bottom = `${lastKeyboardHeight}px`;
  }

  // Terminal needs space for: status bar (32px) + extra keys bar + keyboard
  const totalBottomSpace = extraKeysBarHeight + lastKeyboardHeight;
  document.documentElement.style.setProperty("--extra-keys-height", `${totalBottomSpace}px`);

  fitAddon.fit();
  sendResize();
}

window.addEventListener("resize", updateLayout);

// visualViewport is the key API for detecting soft keyboard on mobile
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", updateLayout);
  window.visualViewport.addEventListener("scroll", updateLayout);
}

// Initial layout calculation after extra keys are rendered
requestAnimationFrame(updateLayout);

// --- Focus terminal on tap (mobile) ---
terminalContainer.addEventListener("touchstart", () => {
  terminal.focus();
});

// --- Unlock audio on ANY user gesture (mobile browsers require this) ---
// Some browsers need 'click' not just 'touchstart', so we listen on both
document.addEventListener("click", () => unlockAudio(), { once: true });
document.addEventListener("touchstart", () => unlockAudio(), { once: true });

// --- Start ---
(window as any).__itwillsync_loaded = true;
initNotifications({
  statusBar: document.getElementById("status-bar")!,
  statusDot,
  statusText,
});
terminal.focus();
connection.connect();
