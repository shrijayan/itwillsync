/**
 * Termux-style extra keys toolbar for mobile terminal interaction.
 *
 * Layout (2 rows):
 *   Row 1: ESC  /  —  HOME  ↑  END  PGUP
 *   Row 2: TAB  CTRL  ALT  SHIFT  ←  ↓  →  PGDN
 *
 * CTRL, ALT, and SHIFT are sticky one-shot modifiers.
 * CTRL and ALT are mutually exclusive; SHIFT combines with either.
 */

// --- Key definitions ---

interface KeyDef {
  label: string;
  sequence: string | null; // null = modifier key
  isModifier?: boolean;
  repeatable?: boolean;
}

const ROW1: KeyDef[] = [
  { label: "ESC", sequence: "\x1b" },
  { label: "/", sequence: "/" },
  { label: "—", sequence: "-" },
  { label: "HOME", sequence: "\x1b[H" },
  { label: "↑", sequence: "\x1b[A", repeatable: true },
  { label: "END", sequence: "\x1b[F" },
  { label: "PGUP", sequence: "\x1b[5~" },
];

const ROW2: KeyDef[] = [
  { label: "TAB", sequence: "\t" },
  { label: "CTRL", sequence: null, isModifier: true },
  { label: "ALT", sequence: null, isModifier: true },
  { label: "SHIFT", sequence: null, isModifier: true },
  { label: "←", sequence: "\x1b[D", repeatable: true },
  { label: "↓", sequence: "\x1b[B", repeatable: true },
  { label: "→", sequence: "\x1b[C", repeatable: true },
  { label: "PGDN", sequence: "\x1b[6~" },
];

// --- Modifier state ---

let ctrlActive = false;
let altActive = false;
let shiftActive = false;
let ctrlButton: HTMLElement | null = null;
let altButton: HTMLElement | null = null;
let shiftButton: HTMLElement | null = null;

/**
 * Apply active modifiers to a sequence/character.
 * Returns the modified sequence and resets modifier state.
 *
 * Encoding rules (standard xterm):
 *   - Shift+Tab: dedicated backtab \x1b[Z (universally supported)
 *   - CSI letter sequences (arrows, Home, End): \x1b[1;{mod}X
 *   - CSI number-tilde sequences (PgUp, PgDn): \x1b[N;{mod}~
 *   - Single printable chars: Ctrl codes (A-Z) / Alt ESC prefix / Shift uppercase
 *   - Tab/ESC with Ctrl: pass through (Tab=Ctrl+I, ESC=Ctrl+[)
 *   - Tab/ESC with Alt: ESC prefix
 */
export function applyModifiers(data: string): string {
  if (!ctrlActive && !altActive && !shiftActive) return data;

  let result = data;

  // xterm modifier param: 1 + (shift:1 | alt:2 | ctrl:4)
  const modParam =
    1 +
    ((shiftActive ? 1 : 0) | (altActive ? 2 : 0) | (ctrlActive ? 4 : 0));

  // CSI letter: \x1b[A (arrows, Home, End)
  const csiLetter = result.match(/^\x1b\[([A-Z])$/);
  // CSI number-tilde: \x1b[5~ (PgUp, PgDn)
  const csiTilde = result.match(/^\x1b\[(\d+)~$/);

  if (result === "\t" && shiftActive && !ctrlActive && !altActive) {
    // Shift+Tab: dedicated backtab sequence (universally supported)
    result = "\x1b[Z";
  } else if (csiLetter) {
    // \x1b[A → \x1b[1;5A (Ctrl+Up), \x1b[1;2A (Shift+Up), etc.
    result = `\x1b[1;${modParam}${csiLetter[1]}`;
  } else if (csiTilde) {
    // \x1b[5~ → \x1b[5;5~ (Ctrl+PgUp), etc.
    result = `\x1b[${csiTilde[1]};${modParam}~`;
  } else if (result === "\r" || result === "\n") {
    // Modified Enter: CSI u encoding (kitty keyboard protocol)
    // Shift+Enter → \x1b[13;2u, Ctrl+Enter → \x1b[13;5u, etc.
    result = `\x1b[13;${modParam}u`;
  } else if (result.length === 1) {
    // Single printable character
    if (shiftActive && !ctrlActive && !altActive) {
      result = result.toUpperCase();
    }
    if (ctrlActive) {
      const code = result.toUpperCase().charCodeAt(0);
      if (code >= 64 && code <= 95) {
        result = String.fromCharCode(code - 64);
      }
    }
    if (altActive) {
      result = "\x1b" + result;
    }
  } else if (altActive) {
    // Alt + non-CSI multi-char sequence (Tab, ESC): ESC prefix
    result = "\x1b" + result;
  }
  // Ctrl+Tab → \t (Tab = Ctrl+I, indistinguishable in terminal protocol)
  // Ctrl+ESC → \x1b (pass through)

  // Reset all modifier state
  ctrlActive = false;
  ctrlButton?.classList.remove("active");
  altActive = false;
  altButton?.classList.remove("active");
  shiftActive = false;
  shiftButton?.classList.remove("active");

  return result;
}

/**
 * Check if any modifier is currently armed.
 */
export function hasActiveModifier(): boolean {
  return ctrlActive || altActive || shiftActive;
}

/**
 * Creates the Termux-style extra keys toolbar.
 *
 * @param container - The DOM element to render into
 * @param sendInput - Callback to send terminal input data
 */
export function createExtraKeys(
  container: HTMLElement,
  sendInput: (data: string) => void,
): void {
  function createRow(keys: KeyDef[]): HTMLElement {
    const row = document.createElement("div");
    row.className = "extra-keys-row";

    for (const key of keys) {
      const btn = document.createElement("button");
      btn.className = "extra-key";
      btn.textContent = key.label;
      btn.setAttribute("tabindex", "-1"); // Prevent focus steal

      if (key.isModifier) {
        btn.classList.add("modifier");
        if (key.label === "CTRL") ctrlButton = btn;
        if (key.label === "ALT") altButton = btn;
        if (key.label === "SHIFT") shiftButton = btn;
      }

      // Handle key press (single fire for modifiers and non-repeatable keys)
      const handlePress = (e: Event) => {
        e.preventDefault(); // Prevent focus loss from xterm.js
        e.stopPropagation();

        if (key.isModifier) {
          // Toggle modifier
          if (key.label === "CTRL") {
            ctrlActive = !ctrlActive;
            btn.classList.toggle("active", ctrlActive);
            // CTRL and ALT are mutually exclusive
            if (ctrlActive) {
              altActive = false;
              altButton?.classList.remove("active");
            }
          } else if (key.label === "ALT") {
            altActive = !altActive;
            btn.classList.toggle("active", altActive);
            // ALT and CTRL are mutually exclusive
            if (altActive) {
              ctrlActive = false;
              ctrlButton?.classList.remove("active");
            }
          } else if (key.label === "SHIFT") {
            // SHIFT is independent — combines with CTRL or ALT
            shiftActive = !shiftActive;
            btn.classList.toggle("active", shiftActive);
          }
        } else if (key.sequence !== null) {
          // Apply any active modifiers to the sequence
          const data = applyModifiers(key.sequence);
          sendInput(data);
        }
      };

      if (key.repeatable && key.sequence !== null) {
        // Long-press repeat for arrow keys
        let repeatTimeout: ReturnType<typeof setTimeout> | null = null;
        let repeatInterval: ReturnType<typeof setInterval> | null = null;
        let touchFired = false;

        const stopRepeat = () => {
          if (repeatTimeout !== null) {
            clearTimeout(repeatTimeout);
            repeatTimeout = null;
          }
          if (repeatInterval !== null) {
            clearInterval(repeatInterval);
            repeatInterval = null;
          }
        };

        const startRepeat = (e: Event) => {
          e.preventDefault();
          e.stopPropagation();
          stopRepeat();

          // Fire immediately (first press applies modifiers)
          const data = applyModifiers(key.sequence!);
          sendInput(data);

          // After initial delay, repeat at 60ms intervals (raw sequence, no modifiers)
          repeatTimeout = setTimeout(() => {
            repeatInterval = setInterval(() => {
              sendInput(key.sequence!);
            }, 60);
          }, 300);
        };

        btn.addEventListener("touchstart", (e: Event) => {
          touchFired = true;
          startRepeat(e);
        }, { passive: false });
        btn.addEventListener("touchend", stopRepeat);
        btn.addEventListener("touchcancel", stopRepeat);

        // Desktop: mouse hold to repeat
        btn.addEventListener("mousedown", (e: Event) => {
          if (touchFired) { touchFired = false; return; }
          startRepeat(e);
        });
        btn.addEventListener("mouseup", stopRepeat);
        btn.addEventListener("mouseleave", stopRepeat);
      } else {
        // Use touchstart for mobile (instant, prevents keyboard dismiss)
        btn.addEventListener("touchstart", handlePress, { passive: false });
        // Click fallback for desktop testing
        btn.addEventListener("click", handlePress);
      }

      row.appendChild(btn);
    }

    return row;
  }

  container.appendChild(createRow(ROW1));
  container.appendChild(createRow(ROW2));
}
