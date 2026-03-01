// --- Audio Context ---
let audioContext: AudioContext | null = null;
let audioUnlocked = false;

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
  } catch {
    // AudioContext not available
  }
}

/** Play a two-tone notification chime (D5 -> A5). */
function playChime(): void {
  if (!audioContext) return;

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

// --- Notification Manager ---

const REPEAT_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

interface NotificationEntry {
  timerId: ReturnType<typeof setTimeout>;
}

const activeNotifications = new Map<string, NotificationEntry>();

/**
 * Notify that a session needs attention.
 * Plays a chime immediately and repeats every 2 minutes until cleared.
 */
export function notifyAttention(sessionId: string): void {
  // Already tracking this session
  if (activeNotifications.has(sessionId)) return;

  playChime();

  const timerId = setTimeout(function repeat() {
    playChime();
    const entry = activeNotifications.get(sessionId);
    if (entry) {
      entry.timerId = setTimeout(repeat, REPEAT_INTERVAL_MS);
    }
  }, REPEAT_INTERVAL_MS);

  activeNotifications.set(sessionId, { timerId });
}

/**
 * Clear attention notification for a session.
 * Stops the repeat timer.
 */
export function clearAttention(sessionId: string): void {
  const entry = activeNotifications.get(sessionId);
  if (entry) {
    clearTimeout(entry.timerId);
    activeNotifications.delete(sessionId);
  }
}

/**
 * Clear all active notifications. Call on disconnect/cleanup.
 */
export function clearAll(): void {
  for (const entry of activeNotifications.values()) {
    clearTimeout(entry.timerId);
  }
  activeNotifications.clear();
}
