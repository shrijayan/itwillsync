export interface SessionData {
  id: string;
  name: string;
  port: number;
  token: string;
  agent: string;
  cwd: string;
  status: "active" | "idle" | "attention";
  connectedAt: number;
  lastSeen: number;
}

export interface SessionMetadata {
  pid: number;
  agent: string;
  cwd: string;
  port: number;
  memoryKB: number;
  uptimeMs: number;
  connectedAt: number;
}

export interface CardCallbacks {
  onOpen: (session: SessionData) => void;
  onStop: (sessionId: string) => void;
  onRename: (sessionId: string, newName: string) => void;
  onInfo: (sessionId: string) => void;
}

/**
 * Formats milliseconds into a human-readable uptime string.
 */
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMin = minutes % 60;
  return `${hours}h ${remainingMin}m`;
}

/**
 * Shortens a path for display.
 */
function shortenPath(cwd: string): string {
  const home = cwd.match(/^\/(?:Users|home)\/[^/]+/)?.[0];
  if (home) {
    return "~" + cwd.slice(home.length);
  }
  return cwd;
}

function formatMemory(kb: number): string {
  if (kb < 1024) return `${kb} KB`;
  const mb = (kb / 1024).toFixed(1);
  return `${mb} MB`;
}

/**
 * Creates a session card DOM element.
 */
export function createSessionCard(
  session: SessionData,
  baseIP: string,
  callbacks: CardCallbacks,
): HTMLElement {
  const card = document.createElement("div");
  card.className = `session-card${session.status === "attention" ? " attention" : ""}`;
  card.dataset.sessionId = session.id;

  const uptime = formatUptime(Date.now() - session.connectedAt);
  const shortCwd = shortenPath(session.cwd);

  // Header
  const header = document.createElement("div");
  header.className = "card-header";

  const agentSection = document.createElement("div");
  agentSection.className = "card-agent";

  const dot = document.createElement("div");
  dot.className = `agent-dot ${session.status}`;

  const name = document.createElement("span");
  name.className = "agent-name";
  name.textContent = session.name || session.agent;

  agentSection.appendChild(dot);
  agentSection.appendChild(name);

  const uptimeEl = document.createElement("span");
  uptimeEl.className = "card-uptime";
  uptimeEl.textContent = uptime;

  header.appendChild(agentSection);
  header.appendChild(uptimeEl);

  // CWD
  const cwdEl = document.createElement("div");
  cwdEl.className = "card-cwd";
  cwdEl.textContent = shortCwd;

  // Preview area
  const preview = document.createElement("div");
  preview.className = "card-preview";

  const preEl = document.createElement("pre");
  preEl.className = "card-preview-text";
  preEl.textContent = "Waiting for output...";

  preview.appendChild(preEl);

  // Tap preview area to open terminal
  preview.addEventListener("click", (e) => {
    e.stopPropagation();
    callbacks.onOpen(session);
  });

  // Status badge
  const statusSection = document.createElement("div");
  statusSection.className = "card-status";

  const badge = document.createElement("span");
  badge.className = `status-badge ${session.status}`;
  badge.textContent = session.status;

  statusSection.appendChild(badge);

  // Action bar
  const actions = document.createElement("div");
  actions.className = "card-actions";

  const stopBtn = document.createElement("button");
  stopBtn.className = "action-btn stop";
  stopBtn.textContent = "Stop";
  stopBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    showStopConfirm(card, session.id, callbacks.onStop);
  });

  const renameBtn = document.createElement("button");
  renameBtn.className = "action-btn rename";
  renameBtn.textContent = "Rename";
  renameBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    startRename(card, session.id, callbacks.onRename);
  });

  const infoBtn = document.createElement("button");
  infoBtn.className = "action-btn info";
  infoBtn.textContent = "Info";
  infoBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    callbacks.onInfo(session.id);
  });

  const openBtn = document.createElement("button");
  openBtn.className = "action-btn open";
  openBtn.textContent = "Open";
  openBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    callbacks.onOpen(session);
  });

  actions.appendChild(openBtn);
  actions.appendChild(renameBtn);
  actions.appendChild(infoBtn);
  actions.appendChild(stopBtn);

  // Metadata panel (hidden by default)
  const metaPanel = document.createElement("div");
  metaPanel.className = "card-metadata hidden";

  // Tap anywhere on card to open session
  card.addEventListener("click", () => {
    callbacks.onOpen(session);
  });

  card.appendChild(header);
  card.appendChild(cwdEl);
  card.appendChild(preview);
  card.appendChild(statusSection);
  card.appendChild(actions);
  card.appendChild(metaPanel);

  return card;
}

/**
 * Show inline stop confirmation.
 */
function showStopConfirm(card: HTMLElement, sessionId: string, onStop: (id: string) => void): void {
  // Remove any existing confirm
  card.querySelector(".confirm-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.className = "confirm-overlay";

  const msg = document.createElement("span");
  msg.className = "confirm-msg";
  msg.textContent = "Stop this session?";

  const yesBtn = document.createElement("button");
  yesBtn.className = "confirm-btn yes";
  yesBtn.textContent = "Yes";
  yesBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onStop(sessionId);
    overlay.remove();
  });

  const noBtn = document.createElement("button");
  noBtn.className = "confirm-btn no";
  noBtn.textContent = "No";
  noBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    overlay.remove();
  });

  overlay.addEventListener("click", (e) => e.stopPropagation());
  overlay.appendChild(msg);
  overlay.appendChild(yesBtn);
  overlay.appendChild(noBtn);
  card.appendChild(overlay);
}

/**
 * Start inline rename editing.
 */
function startRename(card: HTMLElement, sessionId: string, onRename: (id: string, name: string) => void): void {
  const nameEl = card.querySelector(".agent-name");
  if (!nameEl) return;

  const currentName = nameEl.textContent || "";

  const input = document.createElement("input");
  input.className = "rename-input";
  input.type = "text";
  input.value = currentName;

  const finishRename = (): void => {
    const newName = input.value.trim();
    if (newName && newName !== currentName) {
      onRename(sessionId, newName);
    }
    // Restore name element
    nameEl.textContent = newName || currentName;
    (nameEl as HTMLElement).style.display = "";
    input.remove();
  };

  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      finishRename();
    } else if (e.key === "Escape") {
      nameEl.textContent = currentName;
      (nameEl as HTMLElement).style.display = "";
      input.remove();
    }
  });

  input.addEventListener("blur", finishRename);
  input.addEventListener("click", (e) => e.stopPropagation());

  (nameEl as HTMLElement).style.display = "none";
  nameEl.parentElement?.insertBefore(input, nameEl.nextSibling);
  input.focus();
  input.select();
}

/**
 * Updates an existing session card with new data.
 */
export function updateSessionCard(card: HTMLElement, session: SessionData): void {
  const dot = card.querySelector(".agent-dot");
  const badge = card.querySelector(".status-badge");
  const uptimeEl = card.querySelector(".card-uptime");
  const nameEl = card.querySelector(".agent-name");

  if (dot) {
    dot.className = `agent-dot ${session.status}`;
  }
  if (badge) {
    badge.className = `status-badge ${session.status}`;
    badge.textContent = session.status;
  }
  if (uptimeEl) {
    uptimeEl.textContent = formatUptime(Date.now() - session.connectedAt);
  }
  if (nameEl && !(nameEl as HTMLElement).style.display) {
    // Only update name if not currently being edited
    nameEl.textContent = session.name || session.agent;
  }

  if (session.status === "attention") {
    card.classList.add("attention");
  } else {
    card.classList.remove("attention");
  }
}

/**
 * Updates the live preview text in a session card.
 */
export function updateSessionPreview(card: HTMLElement, lines: string[]): void {
  const preEl = card.querySelector(".card-preview-text");
  if (preEl) {
    if (lines.length > 0) {
      preEl.textContent = lines.join("\n");
      preEl.classList.remove("empty");
    } else {
      preEl.textContent = "Waiting for output...";
      preEl.classList.add("empty");
    }
  }
}

/**
 * Show metadata panel in a session card.
 */
export function showMetadata(card: HTMLElement, metadata: SessionMetadata): void {
  const panel = card.querySelector(".card-metadata");
  if (!panel) return;

  // Clear existing content
  while (panel.firstChild) panel.removeChild(panel.firstChild);

  const items = [
    ["PID", String(metadata.pid)],
    ["Agent", metadata.agent],
    ["Port", String(metadata.port)],
    ["Directory", metadata.cwd],
    ["Memory", formatMemory(metadata.memoryKB)],
    ["Uptime", formatUptime(metadata.uptimeMs)],
  ];

  for (const [label, value] of items) {
    const row = document.createElement("div");
    row.className = "meta-row";

    const labelEl = document.createElement("span");
    labelEl.className = "meta-label";
    labelEl.textContent = label;

    const valueEl = document.createElement("span");
    valueEl.className = "meta-value";
    valueEl.textContent = value;

    row.appendChild(labelEl);
    row.appendChild(valueEl);
    panel.appendChild(row);
  }

  panel.classList.toggle("hidden");
}
