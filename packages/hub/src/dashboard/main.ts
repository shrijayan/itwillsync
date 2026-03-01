import "./style.css";
import {
  createSessionCard,
  updateSessionCard,
  updateSessionPreview,
  showMetadata,
  type SessionData,
  type SessionMetadata,
  type CardCallbacks,
} from "./session-card.js";
import {
  unlockAudio,
  notifyAttention,
  clearAttention,
  clearAll as clearAllNotifications,
} from "./audio.js";

// Extract connection info from URL
const params = new URLSearchParams(window.location.search);
const token = params.get("token");

if (!token) {
  document.body.textContent = "Missing authentication token.";
  throw new Error("No token in URL");
}

const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const wsUrl = `${wsProtocol}//${window.location.host}?token=${token}`;
const baseIP = window.location.hostname;

// State
const sessions = new Map<string, SessionData>();
const sessionCards = new Map<string, HTMLElement>();

// DOM references
const sessionList = document.getElementById("session-list")!;
const emptyState = document.getElementById("empty-state")!;
const sessionCount = document.getElementById("session-count")!;
const statusDot = document.getElementById("status-dot")!;

let uptimeInterval: ReturnType<typeof setInterval> | null = null;

// Unlock audio on first user gesture (mobile browser requirement)
function handleFirstInteraction(): void {
  unlockAudio();
  document.removeEventListener("click", handleFirstInteraction);
  document.removeEventListener("touchstart", handleFirstInteraction);
}
document.addEventListener("click", handleFirstInteraction);
document.addEventListener("touchstart", handleFirstInteraction);

// --- WS sending ---

function sendMessage(msg: object): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

// --- Card callbacks ---

const cardCallbacks: CardCallbacks = {
  onOpen(session: SessionData) {
    // Use latest session data (the closure session may be stale)
    const current = sessions.get(session.id) || session;
    if (current.status === "attention") {
      sendMessage({ type: "clear-attention", sessionId: current.id });
      clearAttention(current.id);
    }
    const hubUrl = window.location.href;
    const url = `http://${baseIP}:${current.port}?token=${current.token}&hub=${encodeURIComponent(hubUrl)}`;
    window.open(url, "_blank");
  },

  onStop(sessionId: string) {
    sendMessage({ type: "stop-session", sessionId });
  },

  onRename(sessionId: string, newName: string) {
    sendMessage({ type: "rename-session", sessionId, name: newName });
  },

  onInfo(sessionId: string) {
    sendMessage({ type: "get-metadata", sessionId });
  },
};

// --- UI management ---

function updateUI(): void {
  const count = sessions.size;
  sessionCount.textContent = `${count} session${count !== 1 ? "s" : ""}`;

  if (count === 0) {
    emptyState.style.display = "flex";
  } else {
    emptyState.style.display = "none";
  }
}

function addSession(session: SessionData): void {
  sessions.set(session.id, session);

  const card = createSessionCard(session, baseIP, cardCallbacks);
  sessionCards.set(session.id, card);

  sessionList.insertBefore(card, emptyState);
  updateUI();
}

function removeSession(sessionId: string): void {
  sessions.delete(sessionId);

  const card = sessionCards.get(sessionId);
  if (card) {
    card.remove();
    sessionCards.delete(sessionId);
  }
  updateUI();
}

function updateSession(session: SessionData): void {
  sessions.set(session.id, session);

  const card = sessionCards.get(session.id);
  if (card) {
    updateSessionCard(card, session);
  }
}

function refreshUptimes(): void {
  for (const [id, session] of sessions) {
    const card = sessionCards.get(id);
    if (card) {
      updateSessionCard(card, session);
    }
  }
}

// --- WebSocket Connection ---

let ws: WebSocket | null = null;
let reconnectAttempt = 0;
const MAX_RECONNECT_DELAY_MS = 10_000;

function connect(): void {
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    statusDot.className = "connected";
    reconnectAttempt = 0;

    if (uptimeInterval) clearInterval(uptimeInterval);
    uptimeInterval = setInterval(refreshUptimes, 10_000);
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string);

      switch (msg.type) {
        case "sessions": {
          clearAllNotifications();
          for (const id of sessionCards.keys()) {
            removeSession(id);
          }
          for (const session of msg.sessions as SessionData[]) {
            addSession(session);
            if (session.status === "attention") {
              notifyAttention(session.id);
            }
          }
          break;
        }
        case "session-added": {
          addSession(msg.session as SessionData);
          break;
        }
        case "session-removed": {
          const removedId = msg.sessionId as string;
          clearAttention(removedId);
          removeSession(removedId);
          break;
        }
        case "session-updated": {
          const updated = msg.session as SessionData;
          updateSession(updated);
          if (updated.status === "attention") {
            notifyAttention(updated.id);
          } else {
            clearAttention(updated.id);
          }
          break;
        }
        case "preview": {
          const card = sessionCards.get(msg.sessionId as string);
          if (card) {
            updateSessionPreview(card, msg.lines as string[]);
          }
          break;
        }
        case "metadata": {
          const card = sessionCards.get(msg.sessionId as string);
          if (card) {
            showMetadata(card, msg.metadata as SessionMetadata);
          }
          break;
        }
        case "operation-error": {
          console.warn(`Operation "${msg.operation}" failed for session ${msg.sessionId}: ${msg.error}`);
          break;
        }
      }
    } catch {
      // Ignore malformed messages
    }
  };

  ws.onclose = () => {
    statusDot.className = "reconnecting";
    clearAllNotifications();
    scheduleReconnect();
  };

  ws.onerror = () => {
    ws?.close();
  };
}

function scheduleReconnect(): void {
  const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempt), MAX_RECONNECT_DELAY_MS);
  reconnectAttempt++;
  setTimeout(connect, delay);
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && ws?.readyState !== WebSocket.OPEN) {
    reconnectAttempt = 0;
    connect();
  }
});

connect();
