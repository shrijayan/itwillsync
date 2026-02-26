import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";

// --- DOM Elements ---
const terminalContainer = document.getElementById("terminal-container")!;
const statusDot = document.getElementById("status-dot")!;
const statusText = document.getElementById("status-text")!;

// --- Extract token from URL ---
const params = new URLSearchParams(window.location.search);
const token = params.get("token");

if (!token) {
  statusText.textContent = "Error: No auth token in URL";
  throw new Error("Missing token parameter");
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

// --- WebSocket Connection ---
let ws: WebSocket | null = null;
let reconnectAttempts = 0;
let reconnectOverlay: HTMLElement | null = null;
const MAX_RECONNECT_DELAY = 10000;

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
  text.textContent = "Reconnecting...";
  overlay.appendChild(text);

  return overlay;
}

function setStatus(state: "connected" | "disconnected" | "reconnecting"): void {
  statusDot.className = state === "connected" ? "connected" : state === "reconnecting" ? "reconnecting" : "";
  statusText.textContent =
    state === "connected"
      ? "Connected"
      : state === "reconnecting"
        ? `Reconnecting (attempt ${reconnectAttempts})...`
        : "Disconnected";

  // Manage reconnect overlay
  if (state === "reconnecting" && !reconnectOverlay) {
    reconnectOverlay = createReconnectOverlay();
    document.body.appendChild(reconnectOverlay);
  } else if (state === "connected" && reconnectOverlay) {
    reconnectOverlay.remove();
    reconnectOverlay = null;
  }
}

function connect(): void {
  ws = new WebSocket(getWsUrl());

  ws.onopen = () => {
    reconnectAttempts = 0;
    setStatus("connected");

    // Send initial terminal size
    sendResize();
  };

  ws.onmessage = (event) => {
    // Server sends raw terminal data
    terminal.write(typeof event.data === "string" ? event.data : new Uint8Array(event.data as ArrayBuffer));
  };

  ws.onclose = () => {
    setStatus("reconnecting");
    scheduleReconnect();
  };

  ws.onerror = () => {
    // onclose will fire after onerror, so reconnect is handled there
  };
}

function scheduleReconnect(): void {
  reconnectAttempts++;
  const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts - 1), MAX_RECONNECT_DELAY);
  setTimeout(connect, delay);
}

function sendResize(): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: "resize",
      cols: terminal.cols,
      rows: terminal.rows,
    }));
  }
}

// --- Terminal Input → WebSocket ---
terminal.onData((data: string) => {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: "input",
      data,
    }));
  }
});

// --- Handle Resize ---
window.addEventListener("resize", () => {
  fitAddon.fit();
  sendResize();
});

// Handle mobile keyboard show/hide
if ("visualViewport" in window && window.visualViewport) {
  window.visualViewport.addEventListener("resize", () => {
    fitAddon.fit();
    sendResize();
  });
}

// --- Focus terminal on tap (mobile) ---
terminalContainer.addEventListener("touchstart", () => {
  terminal.focus();
});

// --- Start ---
terminal.focus();
connect();
