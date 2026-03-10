interface SleepPreventionState {
  enabled: boolean;
  platform: string;
  enabledAt: number | null;
  error: string | null;
  supported: boolean;
}

let sendMessageFn: ((msg: object) => void) | null = null;

// DOM refs (set during init)
let settingsModal: HTMLElement;
let sleepToggle: HTMLButtonElement;
let passwordSection: HTMLElement;
let passwordInput: HTMLInputElement;
let sleepError: HTMLElement;
let sleepSpinner: HTMLElement;
let sleepUnsupported: HTMLElement;
let enableBtn: HTMLButtonElement;

let currentState: SleepPreventionState | null = null;

export function initSettings(sendMessage: (msg: object) => void): void {
  sendMessageFn = sendMessage;

  const btnSettings = document.getElementById("btn-settings")!;
  settingsModal = document.getElementById("settings-modal")!;
  const closeBtn = document.getElementById("settings-modal-close")!;
  sleepToggle = document.getElementById("sleep-toggle") as HTMLButtonElement;
  passwordSection = document.getElementById("sleep-password-section")!;
  passwordInput = document.getElementById("sleep-password") as HTMLInputElement;
  sleepError = document.getElementById("sleep-error")!;
  sleepSpinner = document.getElementById("sleep-spinner")!;
  sleepUnsupported = document.getElementById("sleep-unsupported")!;
  enableBtn = document.getElementById("sleep-enable") as HTMLButtonElement;
  const cancelBtn = document.getElementById("sleep-cancel")!;

  // Open/close settings modal
  btnSettings.addEventListener("click", () => {
    settingsModal.classList.remove("hidden");
  });

  closeBtn.addEventListener("click", closeModal);

  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) closeModal();
  });

  // Toggle click
  sleepToggle.addEventListener("click", () => {
    if (sleepToggle.disabled) return;

    const isEnabled = sleepToggle.getAttribute("aria-checked") === "true";

    if (isEnabled) {
      // Disable — no password needed
      sendMessageFn?.({ type: "disable-sleep-prevention" });
    } else {
      // Show password section
      passwordSection.classList.remove("hidden");
      sleepError.classList.add("hidden");
      passwordInput.value = "";
      passwordInput.focus();
    }
  });

  // Enable button
  enableBtn.addEventListener("click", submitEnable);

  // Enter key in password field
  passwordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitEnable();
    }
  });

  // Cancel button
  cancelBtn.addEventListener("click", () => {
    passwordSection.classList.add("hidden");
    passwordInput.value = "";
    sleepError.classList.add("hidden");
  });
}

function submitEnable(): void {
  const password = passwordInput.value;
  if (!password) {
    showError("Password is required");
    return;
  }

  // Clear password from input immediately
  passwordInput.value = "";
  sleepError.classList.add("hidden");
  passwordSection.classList.add("hidden");
  sleepSpinner.classList.remove("hidden");

  sendMessageFn?.({ type: "enable-sleep-prevention", password });
}

function closeModal(): void {
  settingsModal.classList.add("hidden");
  passwordSection.classList.add("hidden");
  passwordInput.value = "";
  sleepError.classList.add("hidden");
}

function showError(msg: string): void {
  sleepError.textContent = msg;
  sleepError.classList.remove("hidden");
}

export function handleSleepStateUpdate(state: SleepPreventionState): void {
  currentState = state;
  sleepSpinner.classList.add("hidden");

  if (!state.supported) {
    sleepToggle.disabled = true;
    sleepToggle.setAttribute("aria-checked", "false");
    sleepUnsupported.classList.remove("hidden");
    return;
  }

  sleepUnsupported.classList.add("hidden");
  sleepToggle.disabled = false;
  sleepToggle.setAttribute("aria-checked", state.enabled ? "true" : "false");

  // Hide password section on state update (success or external change)
  passwordSection.classList.add("hidden");
  passwordInput.value = "";
  sleepError.classList.add("hidden");
}

export function handleSleepError(error: string): void {
  sleepSpinner.classList.add("hidden");

  // Show password section again with error
  passwordSection.classList.remove("hidden");
  showError(error);

  // Reset toggle to OFF
  sleepToggle.setAttribute("aria-checked", "false");
}
