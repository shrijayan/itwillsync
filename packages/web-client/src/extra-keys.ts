/**
 * Termux-style extra keys toolbar for mobile terminal interaction.
 *
 * Layout (2 rows x 7 keys):
 *   Row 1: ESC  /  —  HOME  ↑  END  PGUP
 *   Row 2: TAB  CTRL  ALT  ←  ↓  →  PGDN
 *
 * CTRL and ALT are sticky one-shot modifiers.
 */

// --- Key definitions ---

interface KeyDef {
  label: string;
  sequence: string | null; // null = modifier key
  isModifier?: boolean;
}

const ROW1: KeyDef[] = [
  { label: "ESC", sequence: "\x1b" },
  { label: "/", sequence: "/" },
  { label: "—", sequence: "-" },
  { label: "HOME", sequence: "\x1b[H" },
  { label: "↑", sequence: "\x1b[A" },
  { label: "END", sequence: "\x1b[F" },
  { label: "PGUP", sequence: "\x1b[5~" },
];

const ROW2: KeyDef[] = [
  { label: "TAB", sequence: "\t" },
  { label: "CTRL", sequence: null, isModifier: true },
  { label: "ALT", sequence: null, isModifier: true },
  { label: "←", sequence: "\x1b[D" },
  { label: "↓", sequence: "\x1b[B" },
  { label: "→", sequence: "\x1b[C" },
  { label: "PGDN", sequence: "\x1b[6~" },
];

// --- Modifier state ---

let ctrlActive = false;
let altActive = false;
let ctrlButton: HTMLElement | null = null;
let altButton: HTMLElement | null = null;

/**
 * Apply active modifiers to a sequence/character.
 * Returns the modified sequence and resets modifier state.
 */
export function applyModifiers(data: string): string {
  let result = data;

  if (ctrlActive) {
    // For single printable characters, convert to control code
    if (result.length === 1) {
      const code = result.toUpperCase().charCodeAt(0);
      // Ctrl+A through Ctrl+Z (and some punctuation)
      if (code >= 64 && code <= 95) {
        result = String.fromCharCode(code - 64);
      }
    }
    ctrlActive = false;
    ctrlButton?.classList.remove("active");
  }

  if (altActive) {
    // Alt prefix: ESC + sequence
    result = "\x1b" + result;
    altActive = false;
    altButton?.classList.remove("active");
  }

  return result;
}

/**
 * Check if any modifier is currently armed.
 */
export function hasActiveModifier(): boolean {
  return ctrlActive || altActive;
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
      }

      // Handle key press
      const handlePress = (e: Event) => {
        e.preventDefault(); // Prevent focus loss from xterm.js
        e.stopPropagation();

        if (key.isModifier) {
          // Toggle modifier
          if (key.label === "CTRL") {
            ctrlActive = !ctrlActive;
            btn.classList.toggle("active", ctrlActive);
            // If turning on CTRL, turn off ALT
            if (ctrlActive) {
              altActive = false;
              altButton?.classList.remove("active");
            }
          } else if (key.label === "ALT") {
            altActive = !altActive;
            btn.classList.toggle("active", altActive);
            // If turning on ALT, turn off CTRL
            if (altActive) {
              ctrlActive = false;
              ctrlButton?.classList.remove("active");
            }
          }
        } else if (key.sequence !== null) {
          // Apply any active modifiers to the sequence
          const data = applyModifiers(key.sequence);
          sendInput(data);
        }
      };

      // Use touchstart for mobile (instant, prevents keyboard dismiss)
      btn.addEventListener("touchstart", handlePress, { passive: false });
      // Click fallback for desktop testing
      btn.addEventListener("click", handlePress);

      row.appendChild(btn);
    }

    return row;
  }

  container.appendChild(createRow(ROW1));
  container.appendChild(createRow(ROW2));
}
