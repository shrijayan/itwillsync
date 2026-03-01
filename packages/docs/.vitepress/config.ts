import { defineConfig } from "vitepress";
import llmstxt from "vitepress-plugin-llms";
import { copyOrDownloadAsMarkdownButtons } from "vitepress-plugin-llms";

export default defineConfig({
  title: "itwillsync",
  description: "Sync any terminal agent to your phone",
  base: "/itwillsync/docs/",

  vite: {
    plugins: [llmstxt()],
  },

  markdown: {
    config(md) {
      md.use(copyOrDownloadAsMarkdownButtons);
    },
  },

  themeConfig: {
    nav: [
      { text: "Home", link: "/" },
      { text: "Website", link: "https://shrijayan.github.io/itwillsync/" },
    ],

    sidebar: [
      {
        text: "Getting Started",
        items: [
          { text: "Introduction", link: "/getting-started/introduction" },
          { text: "Installation", link: "/getting-started/installation" },
          { text: "Quick Start", link: "/getting-started/quick-start" },
          { text: "Tailscale Setup", link: "/getting-started/tailscale" },
        ],
      },
      {
        text: "Dashboard",
        items: [
          { text: "Overview", link: "/dashboard/overview" },
          { text: "Managing Sessions", link: "/dashboard/managing-sessions" },
          { text: "Live Previews", link: "/dashboard/live-previews" },
          { text: "Security Model", link: "/dashboard/security" },
        ],
      },
      {
        text: "CLI Reference",
        items: [
          { text: "Commands & Flags", link: "/cli/commands" },
          { text: "Hub Management", link: "/cli/hub" },
          { text: "Configuration", link: "/cli/configuration" },
        ],
      },
      {
        text: "Architecture",
        items: [
          { text: "How It Works", link: "/architecture/overview" },
          { text: "WebSocket Protocol", link: "/architecture/protocol" },
          { text: "Hub Daemon", link: "/architecture/hub" },
          { text: "Contributing", link: "/architecture/contributing" },
        ],
      },
    ],

    socialLinks: [
      { icon: "github", link: "https://github.com/shrijayan/itwillsync" },
    ],

    footer: {
      message: "Released under the MIT License.",
    },

    search: {
      provider: "local",
    },
  },
});
