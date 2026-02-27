interface Span {
  text: string;
  cls: string;
}

interface Line {
  spans: Span[];
  instant?: boolean;
}

interface Phase {
  lines: Line[];
  delayAfter: number;
}

const CHAR_DELAY = 55;
const LINE_DELAY = 120;
const HOLD_DURATION = 5000;
const FADE_DURATION = 400;
const INITIAL_DELAY = 800;

const QR_ART = [
  "  \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588  \u2588\u2588\u2588\u2588  \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588",
  "  \u2588\u2588          \u2588\u2588  \u2588\u2588\u2588\u2588  \u2588\u2588          \u2588\u2588",
  "  \u2588\u2588  \u2588\u2588\u2588\u2588\u2588\u2588  \u2588\u2588    \u2588\u2588  \u2588\u2588  \u2588\u2588\u2588\u2588\u2588\u2588  \u2588\u2588",
  "  \u2588\u2588  \u2588\u2588\u2588\u2588\u2588\u2588  \u2588\u2588  \u2588\u2588    \u2588\u2588  \u2588\u2588\u2588\u2588\u2588\u2588  \u2588\u2588",
  "  \u2588\u2588  \u2588\u2588\u2588\u2588\u2588\u2588  \u2588\u2588  \u2588\u2588\u2588\u2588  \u2588\u2588  \u2588\u2588\u2588\u2588\u2588\u2588  \u2588\u2588",
  "  \u2588\u2588          \u2588\u2588        \u2588\u2588          \u2588\u2588",
  "  \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588  \u2588\u2588  \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588",
  "                  \u2588\u2588\u2588\u2588",
  "  \u2588\u2588\u2588\u2588\u2588\u2588  \u2588\u2588  \u2588\u2588\u2588\u2588    \u2588\u2588  \u2588\u2588    \u2588\u2588\u2588\u2588",
  "      \u2588\u2588\u2588\u2588    \u2588\u2588  \u2588\u2588\u2588\u2588\u2588\u2588    \u2588\u2588\u2588\u2588  \u2588\u2588",
  "  \u2588\u2588  \u2588\u2588  \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588  \u2588\u2588  \u2588\u2588\u2588\u2588  \u2588\u2588\u2588\u2588",
  "                  \u2588\u2588    \u2588\u2588      \u2588\u2588",
  "  \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588  \u2588\u2588\u2588\u2588\u2588\u2588    \u2588\u2588  \u2588\u2588\u2588\u2588",
  "  \u2588\u2588          \u2588\u2588    \u2588\u2588  \u2588\u2588\u2588\u2588\u2588\u2588    \u2588\u2588",
  "  \u2588\u2588  \u2588\u2588\u2588\u2588\u2588\u2588  \u2588\u2588  \u2588\u2588\u2588\u2588    \u2588\u2588  \u2588\u2588",
  "  \u2588\u2588  \u2588\u2588\u2588\u2588\u2588\u2588  \u2588\u2588    \u2588\u2588\u2588\u2588\u2588\u2588      \u2588\u2588",
  "  \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588  \u2588\u2588  \u2588\u2588  \u2588\u2588\u2588\u2588  \u2588\u2588\u2588\u2588",
];

const SEPARATOR = "\u2500".repeat(48);

function buildPhases(): Phase[] {
  return [
    // Phase 1: Command prompt
    {
      lines: [
        {
          spans: [
            { text: "$ ", cls: "t-green" },
            { text: "npx ", cls: "t-white" },
            { text: "itwillsync", cls: "t-cyan" },
            { text: " -- ", cls: "t-dim" },
            { text: "claude", cls: "t-yellow" },
          ],
        },
      ],
      delayAfter: 300,
    },
    // Phase 2: Loading
    {
      lines: [
        { spans: [], instant: true },
        {
          spans: [{ text: "Setting up itwillsync v1.0.3...", cls: "t-dim" }],
          instant: true,
        },
      ],
      delayAfter: 700,
    },
    // Phase 3: Output header
    {
      lines: [
        { spans: [], instant: true },
        { spans: [{ text: SEPARATOR, cls: "t-dim" }], instant: true },
        { spans: [], instant: true },
        {
          spans: [
            {
              text: "  Scan this QR code on your phone to connect:",
              cls: "t-white",
            },
          ],
          instant: true,
        },
        { spans: [], instant: true },
      ],
      delayAfter: 400,
    },
    // Phase 4: QR code
    {
      lines: QR_ART.map((line) => ({
        spans: [{ text: line, cls: "t-white" }],
        instant: true,
      })),
      delayAfter: 200,
    },
    // Phase 5: Server info
    {
      lines: [
        { spans: [], instant: true },
        {
          spans: [
            { text: "  http://192.168.1.42:3456", cls: "t-cyan" },
            { text: "?token=a1b2c3d4e5...", cls: "t-dim" },
          ],
          instant: true,
        },
        { spans: [], instant: true },
        { spans: [{ text: SEPARATOR, cls: "t-dim" }], instant: true },
        { spans: [], instant: true },
        {
          spans: [
            { text: "  Server listening on 0.0.0.0:3456", cls: "t-muted" },
          ],
          instant: true,
        },
        {
          spans: [{ text: "  Running: claude", cls: "t-muted" }],
          instant: true,
        },
        {
          spans: [{ text: "  PID: 48291", cls: "t-muted" }],
          instant: true,
        },
        {
          spans: [{ text: "  Sleep prevention: active", cls: "t-muted" }],
          instant: true,
        },
      ],
      delayAfter: HOLD_DURATION,
    },
  ];
}

function createSpanEl(text: string, cls: string): HTMLSpanElement {
  const el = document.createElement("span");
  el.className = cls;
  el.textContent = text;
  return el;
}

export class TerminalAnimation {
  private el: HTMLPreElement;
  private container: HTMLElement;
  private phases: Phase[];
  private running = false;
  private abortController: AbortController | null = null;

  constructor(outputEl: HTMLPreElement, containerEl: HTMLElement) {
    this.el = outputEl;
    this.container = containerEl;
    this.phases = buildPhases();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.loop();
  }

  stop(): void {
    this.running = false;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private async loop(): Promise<void> {
    while (this.running) {
      this.abortController = new AbortController();
      const signal = this.abortController.signal;

      try {
        // Clear output using safe DOM method
        while (this.el.firstChild) {
          this.el.removeChild(this.el.firstChild);
        }
        this.container.classList.remove("fading");
        this.container.classList.add("visible");

        await this.sleep(INITIAL_DELAY, signal);

        for (const phase of this.phases) {
          await this.renderPhase(phase, signal);
        }

        // Fade out
        this.container.classList.add("fading");
        this.container.classList.remove("visible");
        await this.sleep(FADE_DURATION, signal);
      } catch {
        // Aborted — exit loop if not running
        if (!this.running) return;
      }
    }
  }

  private async renderPhase(phase: Phase, signal: AbortSignal): Promise<void> {
    for (const line of phase.lines) {
      if (line.instant) {
        this.appendInstantLine(line.spans);
        await this.sleep(LINE_DELAY, signal);
      } else {
        await this.typeLineCharByChar(line, signal);
      }
    }

    await this.sleep(phase.delayAfter, signal);
  }

  private async typeLineCharByChar(
    line: Line,
    signal: AbortSignal
  ): Promise<void> {
    const lineEl = document.createElement("div");
    this.el.appendChild(lineEl);

    const cursorEl = document.createElement("span");
    cursorEl.className = "cursor typing";
    lineEl.appendChild(cursorEl);

    for (const span of line.spans) {
      for (const char of span.text) {
        const charSpan = createSpanEl(char, span.cls);
        lineEl.insertBefore(charSpan, cursorEl);
        await this.sleep(CHAR_DELAY, signal);
      }
    }

    // Switch to blinking cursor, then remove
    cursorEl.className = "cursor";
    await this.sleep(400, signal);
    cursorEl.remove();
  }

  private appendInstantLine(spans: Span[]): void {
    const div = document.createElement("div");
    if (spans.length === 0) {
      // Empty line
      div.textContent = "\u00A0"; // non-breaking space
    } else {
      for (const span of spans) {
        div.appendChild(createSpanEl(span.text, span.cls));
      }
    }
    this.el.appendChild(div);
  }

  private sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }

      const timer = setTimeout(resolve, ms);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        },
        { once: true }
      );
    });
  }
}
