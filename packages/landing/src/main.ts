import { TerminalAnimation } from "./terminal-animation";

// YouTube video ID — set this when video is uploaded
const YOUTUBE_VIDEO_ID = "Zc0Tb98CXh0";

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

function initCopyButton(): void {
  const btn = document.getElementById("copy-btn");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText("npx itwillsync -- claude");
      btn.textContent = "Copied!";
      btn.classList.add("copied");
      setTimeout(() => {
        btn.textContent = "Copy";
        btn.classList.remove("copied");
      }, 2000);
    } catch {
      // Fallback: select text
      btn.textContent = "Copy";
    }
  });
}

function initVideoEmbed(): void {
  const section = document.getElementById("demo");
  const placeholder = document.getElementById("video-placeholder");

  if (!section || !placeholder) return;

  // Hide section if no video ID
  if (!YOUTUBE_VIDEO_ID) {
    section.style.display = "none";
    return;
  }

  placeholder.addEventListener("click", () => {
    const wrapper = placeholder.parentElement;
    if (!wrapper) return;

    const iframe = document.createElement("iframe");
    iframe.src = `https://www.youtube-nocookie.com/embed/${YOUTUBE_VIDEO_ID}?autoplay=1&rel=0`;
    iframe.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    iframe.allowFullscreen = true;
    iframe.style.cssText = "width:100%;height:100%;border:none;";

    // Replace placeholder with iframe
    wrapper.replaceChild(iframe, placeholder);
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
  initCopyButton();
  initVideoEmbed();
  initStarCount();
});
