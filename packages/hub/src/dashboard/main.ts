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
import {
  initSettings,
  handleSleepStateUpdate,
  handleSleepError,
} from "./settings.js";

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

// --- Settings ---

// initSettings is called after sendMessage is defined (below)

// --- WS sending ---

function sendMessage(msg: object): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

initSettings(sendMessage);

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
    window.location.href = url;
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

// --- Create Session UI ---

const fabCreate = document.getElementById("fab-create")!;
const createModal = document.getElementById("create-modal")!;
const modalClose = document.getElementById("modal-close")!;
const toolInput = document.getElementById("tool-input") as HTMLInputElement;
const toolChips = document.getElementById("tool-chips")!;
const dirSelected = document.getElementById("dir-selected")!;
const btnBrowse = document.getElementById("btn-browse")!;
const btnCreateSession = document.getElementById("btn-create-session") as HTMLButtonElement;
const createError = document.getElementById("create-error")!;
const createFormView = document.getElementById("create-form-view")!;
const browseView = document.getElementById("browse-view")!;
const browseBreadcrumb = document.getElementById("browse-breadcrumb")!;
const browseList = document.getElementById("browse-list")!;
const browseBack = document.getElementById("browse-back")!;
const browseSelect = document.getElementById("browse-select")!;
const createSpinner = document.getElementById("create-spinner")!;

let selectedCwd = "~";
let currentBrowsePath = "~";

function makeEl(tag: string, className: string, text: string): HTMLElement {
  const el = document.createElement(tag);
  el.className = className;
  el.textContent = text;
  return el;
}

function openCreateModal(): void {
  createModal.classList.remove("hidden");
  createFormView.classList.remove("hidden");
  browseView.classList.add("hidden");
  createSpinner.classList.add("hidden");
  createError.classList.add("hidden");
  toolInput.value = "";
  selectedCwd = "~";
  dirSelected.textContent = "~";
  updateCreateButton();
  fetchToolHistory();
  toolInput.focus();
}

function closeCreateModal(): void {
  createModal.classList.add("hidden");
}

function updateCreateButton(): void {
  btnCreateSession.disabled = !toolInput.value.trim();
}

async function fetchToolHistory(): Promise<void> {
  try {
    const res = await fetch(`/api/tool-history?token=${token}`);
    const data = await res.json();
    toolChips.replaceChildren();
    for (const name of (data.tools as string[]).slice(0, 6)) {
      const chip = makeEl("span", "chip", name);
      chip.addEventListener("click", () => {
        toolInput.value = name;
        updateCreateButton();
      });
      toolChips.appendChild(chip);
    }
  } catch { /* ignore */ }
}

async function browseDirectory(path: string): Promise<void> {
  currentBrowsePath = path;
  browseList.replaceChildren(makeEl("div", "browse-empty", "Loading..."));

  try {
    const res = await fetch(`/api/browse?path=${encodeURIComponent(path)}&token=${token}`);
    const data = await res.json();

    if (data.error) {
      browseList.replaceChildren(makeEl("div", "browse-empty", data.error as string));
      return;
    }

    const displayPath = (data.path as string) || path;
    currentBrowsePath = displayPath;
    buildBreadcrumb(displayPath);

    const entries = data.entries as string[];
    if (entries.length === 0) {
      browseList.replaceChildren(makeEl("div", "browse-empty", "No subdirectories"));
      return;
    }

    browseList.replaceChildren();
    for (const name of entries) {
      const item = document.createElement("div");
      item.className = "browse-item";
      item.appendChild(makeEl("span", "browse-item-name", name));
      item.appendChild(makeEl("span", "browse-item-arrow", "\u203A"));
      item.addEventListener("click", () => browseDirectory(`${displayPath}/${name}`));
      browseList.appendChild(item);
    }
  } catch {
    browseList.replaceChildren(makeEl("div", "browse-empty", "Failed to load"));
  }
}

function buildBreadcrumb(displayPath: string): void {
  browseBreadcrumb.replaceChildren();
  const parts = displayPath.split("/").filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) {
      browseBreadcrumb.appendChild(makeEl("span", "breadcrumb-sep", " / "));
    }
    const seg = makeEl("span", "breadcrumb-segment", parts[i]);
    const targetPath = parts.slice(0, i + 1).join("/");
    seg.addEventListener("click", () => browseDirectory(targetPath));
    browseBreadcrumb.appendChild(seg);
  }
}

function doCreateSession(): void {
  const tool = toolInput.value.trim();
  if (!tool) return;
  createError.classList.add("hidden");
  createFormView.classList.add("hidden");
  createSpinner.classList.remove("hidden");
  sendMessage({ type: "create-session", tool, cwd: selectedCwd });
}

fabCreate.addEventListener("click", openCreateModal);
modalClose.addEventListener("click", closeCreateModal);
createModal.addEventListener("click", (e) => {
  if (e.target === createModal) closeCreateModal();
});
toolInput.addEventListener("input", updateCreateButton);
btnCreateSession.addEventListener("click", doCreateSession);
btnBrowse.addEventListener("click", () => {
  createFormView.classList.add("hidden");
  browseView.classList.remove("hidden");
  browseDirectory(selectedCwd);
});
browseBack.addEventListener("click", () => {
  browseView.classList.add("hidden");
  createFormView.classList.remove("hidden");
});
browseSelect.addEventListener("click", () => {
  selectedCwd = currentBrowsePath;
  dirSelected.textContent = selectedCwd;
  browseView.classList.add("hidden");
  createFormView.classList.remove("hidden");
});
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
          // Close create modal if it's open (session was created from dashboard)
          if (!createModal.classList.contains("hidden")) {
            closeCreateModal();
          }
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
        case "session-creating": {
          // Ack received — spinner is already showing
          break;
        }
        case "session-create-error": {
          createSpinner.classList.add("hidden");
          createFormView.classList.remove("hidden");
          createError.textContent = msg.error as string;
          createError.classList.remove("hidden");
          break;
        }
        case "sleep-state": {
          handleSleepStateUpdate(msg.state);
          break;
        }
        case "sleep-error": {
          handleSleepError(msg.error as string);
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
