import { TerminalAnimation } from "./terminal-animation";

function initTerminalAnimation(): void {
  const outputEl = document.getElementById(
    "terminal-output"
  ) as HTMLPreElement | null;
  const containerEl = document.querySelector(
    ".terminal-body"
  ) as HTMLElement | null;

  if (!outputEl || !containerEl) return;

  const animation = new TerminalAnimation(outputEl, containerEl);

  // Only animate when visible
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          animation.start();
        } else {
          animation.stop();
        }
      }
    },
    { threshold: 0.2 }
  );

  observer.observe(containerEl);
}

function initCommandBuilder(): void {
  const agentEl = document.getElementById("cmd-agent");
  const copyBtn = document.getElementById("cmd-copy-btn");
  const copyLabel = document.getElementById("cmd-copy-label");
  const picker = document.querySelectorAll(".agent-btn");

  if (!agentEl || !copyBtn || !copyLabel || !picker.length) return;

  let currentAgent = "claude";

  // Agent picker buttons
  for (const btn of picker) {
    btn.addEventListener("click", () => {
      const agent = (btn as HTMLElement).dataset.agent;
      if (!agent) return;
      currentAgent = agent;
      agentEl.textContent = agent;

      // Update active state
      for (const b of picker) b.classList.remove("active");
      btn.classList.add("active");
    });
  }

  // Copy button
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(`npx itwillsync ${currentAgent}`);
      copyLabel.textContent = "Copied!";
      copyBtn.classList.add("copied");
      setTimeout(() => {
        copyLabel.textContent = "Copy";
        copyBtn.classList.remove("copied");
      }, 2000);
    } catch {
      copyLabel.textContent = "Copy";
    }
  });
}

function initVersionBadge(): void {
  const badge = document.getElementById("version-badge");
  if (!badge) return;

  fetch("https://registry.npmjs.org/itwillsync/latest")
    .then((res) => {
      if (!res.ok) return;
      return res.json();
    })
    .then((data) => {
      if (!data || typeof data.version !== "string") return;
      badge.textContent = `v${data.version}`;
    })
    .catch(() => {
      // Keep whatever is in the HTML as fallback
    });
}

function initStarCount(): void {
  const countEl = document.getElementById("star-count");
  if (!countEl) return;

  fetch("https://api.github.com/repos/shrijayan/itwillsync")
    .then((res) => {
      if (!res.ok) return;
      return res.json();
    })
    .then((data) => {
      if (!data || typeof data.stargazers_count !== "number") return;
      const count = data.stargazers_count;
      countEl.textContent = count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);
      countEl.style.display = "inline";
    })
    .catch(() => {
      // Silently fail — button still works without count
    });
}

// Init everything
document.addEventListener("DOMContentLoaded", () => {
  initTerminalAnimation();
  initCommandBuilder();
  initStarCount();
  initVersionBadge();
});
