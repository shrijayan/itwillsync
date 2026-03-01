# Tailscale Setup

By default, your phone needs to be on the same WiFi network as your computer. With [Tailscale](https://tailscale.com), you can connect from anywhere — coffee shop, cellular, different network.

## Setup

1. Install Tailscale on your **computer** and **phone**
2. Sign in to the same Tailscale account on both devices
3. That's it — itwillsync detects Tailscale automatically

## Usage

On first run, the setup wizard asks your preferred networking mode. Choose "Tailscale" and itwillsync will use your Tailscale IP (100.x.x.x) for the connection URL.

You can also switch modes per-session:

```bash
# Use Tailscale for this session
itwillsync --tailscale -- claude

# Use local WiFi for this session
itwillsync --local -- claude

# Re-run the setup wizard
itwillsync setup
```

## How It Works

When Tailscale mode is active, itwillsync runs `tailscale ip -4` to get your Tailscale IPv4 address. This address is used in the QR code URL instead of your local WiFi IP.

If Tailscale isn't running when you start a session, itwillsync falls back to local WiFi with a warning.

## Tailscale Detection

itwillsync checks for Tailscale in these locations:
- `tailscale` (in PATH)
- `/Applications/Tailscale.app/Contents/MacOS/Tailscale` (macOS)

It verifies the Tailscale IP starts with `100.` (Tailscale's CGNAT range).
