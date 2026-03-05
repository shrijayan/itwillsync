# Tailscale Setup

By default, your phone needs to be on the same WiFi network as your computer. With [Tailscale](https://tailscale.com), you can connect from anywhere — coffee shop, cellular, different network.

## Install Tailscale

You need Tailscale on both your **computer** and your **phone**. Sign into the same account on both — that's what connects them.

### macOS

The quickest way is via Homebrew:

```bash
brew install --cask tailscale
```

Then open Tailscale from Applications → click **Sign in** → choose your email provider → approve in browser.

Verify it's working:

```bash
tailscale status
```

> Other install methods: [Mac App Store](https://apps.apple.com/app/tailscale/id1475387142) · [Direct download](https://tailscale.com/download) · [Official docs](https://tailscale.com/docs/install/mac)

### Android

1. Install from the [Google Play Store](https://play.google.com/store/apps/details?id=com.tailscale.ipn)
2. Open the app → tap **Get Started**
3. Accept the VPN configuration prompt
4. Tap **Sign in with Google** (or "Sign in with other" for other providers)
5. **Use the same email/account as your computer**

> Requires Android 8.0+ · [Official docs](https://tailscale.com/docs/install/android)

### iOS (iPhone / iPad)

1. Install from the [App Store](https://apps.apple.com/app/tailscale/id1470499037)
2. Open the app → tap **Get Started**
3. Accept the VPN configuration prompt
4. Tap **Log in** → sign in with a supported provider
5. **Use the same email/account as your computer**

> Requires iOS 15.0+ · [Official docs](https://tailscale.com/docs/install/ios)

### Other Platforms

Tailscale supports many more platforms. See the full list at [tailscale.com/docs/install](https://tailscale.com/docs/install):

| Platform | Install Guide |
|----------|--------------|
| Linux | [tailscale.com/docs/install/linux](https://tailscale.com/docs/install/linux) |
| Windows | [tailscale.com/docs/install/windows](https://tailscale.com/docs/install/windows) |
| Windows (WSL 2) | [tailscale.com/docs/install/windows/wsl2](https://tailscale.com/docs/install/windows/wsl2) |
| Chromebook | [tailscale.com/docs/install/chromebook](https://tailscale.com/docs/install/chromebook) |
| Apple TV | [tailscale.com/docs/install/appletv](https://tailscale.com/docs/install/appletv) |
| Amazon Fire | [tailscale.com/docs/install/amazon-fire](https://tailscale.com/docs/install/amazon-fire) |

### Verify Connection

Both devices should appear in your [Tailscale admin console](https://login.tailscale.com/admin/machines). On your computer, run:

```bash
tailscale status
```

You should see both devices listed. That's it — itwillsync detects Tailscale automatically.

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
