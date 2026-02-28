// --- Audio ---
let audioContext: AudioContext | null = null;
let audioUnlocked = false;

// --- Visual ---
let statusBar: HTMLElement | null = null;
let statusDot: HTMLElement | null = null;
let statusText: HTMLElement | null = null;
let originalTitle = "";
let titleFlashInterval: ReturnType<typeof setInterval> | null = null;

/** Initialize notification system. Call on page load. */
export function initNotifications(elements: {
  statusBar: HTMLElement;
  statusDot: HTMLElement;
  statusText: HTMLElement;
}): void {
  statusBar = elements.statusBar;
  statusDot = elements.statusDot;
  statusText = elements.statusText;
  originalTitle = document.title;
  console.log("[itwillsync] Notification system initialized (sound + visual)");
}

/**
 * Unlock audio playback. Must be called from a user gesture (tap/click).
 * Mobile browsers require this before any audio can play.
 */
export function unlockAudio(): void {
  if (audioUnlocked) return;
  audioUnlocked = true;

  try {
    audioContext = new AudioContext();
    if (audioContext.state === "suspended") {
      audioContext.resume();
    }
    console.log("[itwillsync] Audio unlocked for notifications");
  } catch {
    console.log("[itwillsync] AudioContext not available");
  }
}

/** Play a two-tone notification chime. */
function playNotificationSound(): void {
  if (!audioContext) return;

  // Resume context if it was suspended (e.g., after phone sleep)
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  const now = audioContext.currentTime;

  // First tone — D5 (587 Hz)
  const osc1 = audioContext.createOscillator();
  const gain1 = audioContext.createGain();
  osc1.frequency.value = 587.33;
  osc1.type = "sine";
  gain1.gain.setValueAtTime(0.3, now);
  gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
  osc1.connect(gain1);
  gain1.connect(audioContext.destination);
  osc1.start(now);
  osc1.stop(now + 0.3);

  // Second tone — A5 (880 Hz), slightly delayed
  const osc2 = audioContext.createOscillator();
  const gain2 = audioContext.createGain();
  osc2.frequency.value = 880;
  osc2.type = "sine";
  gain2.gain.setValueAtTime(0.3, now + 0.15);
  gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
  osc2.connect(gain2);
  gain2.connect(audioContext.destination);
  osc2.start(now + 0.15);
  osc2.stop(now + 0.45);
}

/** Flash the status bar with the notification message. */
function showVisualNotification(body: string): void {
  if (!statusBar || !statusDot || !statusText) return;

  // Flash status bar
  statusBar.classList.add("notify");
  statusDot.classList.add("notify");
  statusText.textContent = body;

  // Flash document title
  let visible = true;
  originalTitle = "itwillsync";
  if (titleFlashInterval) clearInterval(titleFlashInterval);
  titleFlashInterval = setInterval(() => {
    document.title = visible ? "\u26a0\ufe0f Agent needs you" : originalTitle;
    visible = !visible;
  }, 1000);
}

/** Clear visual notification (call when user interacts). */
function clearVisualNotification(): void {
  if (statusBar) statusBar.classList.remove("notify");
  if (statusDot) statusDot.classList.remove("notify");
  if (statusText) statusText.textContent = "Connected";

  if (titleFlashInterval) {
    clearInterval(titleFlashInterval);
    titleFlashInterval = null;
  }
  document.title = originalTitle || "itwillsync";
}

/** Show a notification (sound + visual). No suppression — fires immediately. */
export function showNotification(body: string): void {
  console.log(`[itwillsync] Notifying: ${body}`);
  playNotificationSound();
  showVisualNotification(body);
}

/** Record user activity and clear visual notifications. */
export function recordUserActivity(): void {
  clearVisualNotification();
}
