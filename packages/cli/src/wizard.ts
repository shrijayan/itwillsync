import * as p from "@clack/prompts";
import { saveConfig, loadConfig, configExists, type Config, type NetworkingMode } from "./config.js";
import { getTailscaleStatus } from "./tailscale.js";

export async function runSetupWizard(): Promise<Config> {
  p.intro("itwillsync setup");

  const networkingMode = await p.select<NetworkingMode>({
    message: "How do you want to connect your phone?",
    options: [
      {
        value: "local",
        label: "Local Network",
        hint: "Phone and computer on the same WiFi",
      },
      {
        value: "tailscale",
        label: "Tailscale",
        hint: "Connect from anywhere via Tailscale VPN",
      },
    ],
  });

  if (p.isCancel(networkingMode)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  if (networkingMode === "tailscale") {
    const s = p.spinner();
    s.start("Checking Tailscale status...");

    const status = await getTailscaleStatus();
    s.stop("Tailscale check complete");

    if (!status.installed) {
      p.log.error("Tailscale is not installed.");

      const installHint =
        process.platform === "darwin"
          ? "brew install tailscale  or  https://tailscale.com/download"
          : process.platform === "win32"
            ? "https://tailscale.com/download/windows"
            : "curl -fsSL https://tailscale.com/install.sh | sh";

      p.log.info(`Install: ${installHint}`);

      const saveAnyway = await p.confirm({
        message: "Save Tailscale as your default anyway? (You can install it later)",
        initialValue: false,
      });

      if (p.isCancel(saveAnyway) || !saveAnyway) {
        // Fall back to local
        const config: Config = { networkingMode: "local" };
        saveConfig(config);
        p.outro("Saved as Local Network. Run 'itwillsync setup' to change later.");
        return config;
      }
    } else if (!status.running) {
      p.log.warn("Tailscale is installed but not connected.");
      p.log.info("Run 'tailscale up' or start the Tailscale app to connect.");

      const saveAnyway = await p.confirm({
        message: "Save Tailscale as your default anyway?",
        initialValue: true,
      });

      if (p.isCancel(saveAnyway) || !saveAnyway) {
        const config: Config = { networkingMode: "local" };
        saveConfig(config);
        p.outro("Saved as Local Network. Run 'itwillsync setup' to change later.");
        return config;
      }
    } else {
      p.log.success(
        `Tailscale detected! IP: ${status.ip}${status.hostname ? ` (${status.hostname})` : ""}`
      );
    }
  }

  const config: Config = { networkingMode };
  saveConfig(config);

  const modeLabel = networkingMode === "tailscale" ? "Tailscale" : "Local Network";
  p.outro(`Saved! Your phone will connect via ${modeLabel}.`);

  return config;
}
