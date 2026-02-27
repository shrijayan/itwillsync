interface Span {
  text: string;
  cls: string;
}

interface Line {
  spans: Span[];
  instant?: boolean;
}

const CHAR_DELAY = 55;
const HOLD_DURATION = 4000;
const FADE_DURATION = 400;
const INITIAL_DELAY = 800;

const AGENTS = ["claude", "cline", "copilot", "aider", "goose", "bash"];

// Compact QR using half-block characters (▀▄█ ) — ~half the height
const QR_ART = [
  "  \u2588\u2580\u2580\u2580\u2580\u2580\u2588 \u2584\u2580 \u2588\u2580\u2580\u2580\u2580\u2580\u2588",
  "  \u2588 \u2588\u2588\u2588 \u2588 \u2580\u2584 \u2588 \u2588\u2588\u2588 \u2588",
  "  \u2588\u2584\u2584\u2584\u2584\u2584\u2588 \u2588 \u2588\u2584\u2584\u2584\u2584\u2584\u2588",
  "   \u2584\u2580\u2584 \u2580\u2584\u2580\u2588\u2584\u2580 \u2584\u2580 ",
  "  \u2588\u2584\u2580\u2588\u2580\u2580\u2584\u2588 \u2580\u2584\u2588\u2584\u2580\u2588\u2584",
  "  \u2588\u2580\u2580\u2580\u2580\u2580\u2588 \u2588\u2580 \u2584\u2580\u2588 ",
  "  \u2588 \u2588\u2588\u2588 \u2588 \u2580\u2588\u2580\u2580  \u2584\u2588",
  "  \u2588\u2584\u2584\u2584\u2584\u2584\u2588 \u2588 \u2584\u2588\u2584 \u2588\u2584",
];

const SEPARATOR = "\u2500".repeat(40);

function buildOutputLines(agent: string): Line[] {
  return [
    { spans: [], instant: true },
    {
      spans: [{ text: "Setting up itwillsync...", cls: "t-dim" }],
      instant: true,
    },
    { spans: [], instant: true },
    { spans: [{ text: SEPARATOR, cls: "t-dim" }], instant: true },
    { spans: [], instant: true },
    {
      spans: [
        { text: "  Scan this QR code on your phone to connect:", cls: "t-white" },
      ],
      instant: true,
    },
    { spans: [], instant: true },
    ...QR_ART.map((line) => ({
      spans: [{ text: line, cls: "t-white" }],
      instant: true,
    })),
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
      spans: [{ text: "  Server listening on 0.0.0.0:3456", cls: "t-muted" }],
      instant: true,
    },
    {
      spans: [{ text: `  Running: ${agent}`, cls: "t-muted" }],
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
  private running = false;
  private abortController: AbortController | null = null;
  private agentIndex = 0;

  constructor(outputEl: HTMLPreElement, containerEl: HTMLElement) {
    this.el = outputEl;
    this.container = containerEl;
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

      const agent = AGENTS[this.agentIndex % AGENTS.length];
      this.agentIndex++;

      try {
        // Clear output
        while (this.el.firstChild) {
          this.el.removeChild(this.el.firstChild);
        }
        this.container.classList.remove("fading");
        this.container.classList.add("visible");

        await this.sleep(INITIAL_DELAY, signal);

        // Phase 1: Type the command
        const commandSpans: Span[] = [
          { text: "$ ", cls: "t-green" },
          { text: "npx ", cls: "t-white" },
          { text: "itwillsync", cls: "t-cyan" },
          { text: " -- ", cls: "t-dim" },
          { text: agent, cls: "t-yellow" },
        ];
        await this.typeLineCharByChar(commandSpans, signal);
        await this.sleep(300, signal);

        // Phase 2: Show everything else instantly
        const outputLines = buildOutputLines(agent);
        for (const line of outputLines) {
          this.appendInstantLine(line.spans);
        }
        this.scrollToBottom();

        // Hold
        await this.sleep(HOLD_DURATION, signal);

        // Fade out
        this.container.classList.add("fading");
        this.container.classList.remove("visible");
        await this.sleep(FADE_DURATION, signal);
      } catch {
        if (!this.running) return;
      }
    }
  }

  private async typeLineCharByChar(
    spans: Span[],
    signal: AbortSignal
  ): Promise<void> {
    const lineEl = document.createElement("div");
    this.el.appendChild(lineEl);

    const cursorEl = document.createElement("span");
    cursorEl.className = "cursor typing";
    lineEl.appendChild(cursorEl);

    for (const span of spans) {
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
      div.textContent = "\u00A0";
    } else {
      for (const span of spans) {
        div.appendChild(createSpanEl(span.text, span.cls));
      }
    }
    this.el.appendChild(div);
  }

  private scrollToBottom(): void {
    this.container.scrollTop = this.container.scrollHeight;
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
