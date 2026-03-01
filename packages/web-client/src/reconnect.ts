const MAX_RECONNECT_DELAY = 10_000;
const BASE_DELAY = 1000;
const BACKOFF_MULTIPLIER = 1.5;

export type ConnectionState = "connected" | "reconnecting" | "disconnected";

export interface ConnectionCallbacks {
  getUrl: () => string;
  onOpen: () => void;
  onMessage: (event: MessageEvent) => void;
  onStatusChange: (state: ConnectionState, attempts: number) => void;
}

/**
 * Manages WebSocket connection with smart reconnection.
 *
 * Key behaviors:
 * - Exponential backoff on disconnect (1s → 1.5s → 2.25s → ... max 10s)
 * - Instant reconnect when user returns to tab (visibilitychange)
 * - Instant reconnect on Chrome resume (after freeze)
 * - Screen Wake Lock while tab is visible (prevents screen dimming)
 */
export class ConnectionManager {
  private ws: WebSocket | null = null;
  private attempts = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private wakeLock: WakeLockSentinel | null = null;
  private destroyed = false;

  constructor(private cb: ConnectionCallbacks) {
    this.setupLifecycleHandlers();
  }

  connect(): void {
    if (this.destroyed) return;
    this.clearTimer();

    this.ws = new WebSocket(this.cb.getUrl());

    this.ws.onopen = () => {
      this.attempts = 0;
      this.cb.onStatusChange("connected", 0);
      this.cb.onOpen();
      this.requestWakeLock();
    };

    this.ws.onmessage = (event) => this.cb.onMessage(event);

    this.ws.onclose = () => {
      this.cb.onStatusChange("reconnecting", this.attempts);
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onclose fires after onerror, reconnect handled there
    };
  }

  send(data: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  destroy(): void {
    this.destroyed = true;
    this.clearTimer();
    this.releaseWakeLock();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    this.attempts++;
    const delay = Math.min(BASE_DELAY * Math.pow(BACKOFF_MULTIPLIER, this.attempts - 1), MAX_RECONNECT_DELAY);
    this.timer = setTimeout(() => this.connect(), delay);
  }

  /** Bypass backoff and reconnect immediately (e.g. user returned to tab). */
  private reconnectNow(): void {
    if (this.destroyed || this.ws?.readyState === WebSocket.OPEN) return;
    this.clearTimer();
    // Close any in-progress connection attempt
    if (this.ws?.readyState === WebSocket.CONNECTING) {
      this.ws.onclose = null; // prevent double-reconnect
      this.ws.close();
    }
    this.attempts = 0; // reset backoff
    this.connect();
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private setupLifecycleHandlers(): void {
    // Instant reconnect when user returns to the tab (unlocks phone, switches back)
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        if (!this.isConnected) {
          this.reconnectNow();
        }
        this.requestWakeLock();
      } else {
        this.releaseWakeLock();
      }
    });

    // Chrome fires 'freeze' before suspending a tab and 'resume' when it comes back.
    // These are more reliable than visibilitychange on Android Chrome.
    document.addEventListener("freeze", () => {
      this.releaseWakeLock();
    });

    document.addEventListener("resume", () => {
      if (!this.isConnected) {
        this.reconnectNow();
      }
    });
  }

  /**
   * Request a screen wake lock to prevent the display from dimming
   * while the user is actively viewing the terminal.
   * Released automatically when tab becomes hidden.
   */
  private async requestWakeLock(): Promise<void> {
    if (this.wakeLock || !("wakeLock" in navigator)) return;
    try {
      this.wakeLock = await navigator.wakeLock.request("screen");
      this.wakeLock.addEventListener("release", () => {
        this.wakeLock = null;
      });
    } catch {
      // Wake Lock not available, denied, or low battery — that's fine
    }
  }

  private releaseWakeLock(): void {
    if (this.wakeLock) {
      this.wakeLock.release();
      this.wakeLock = null;
    }
  }
}
