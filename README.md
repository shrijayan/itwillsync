# itwillsync

**[Website](https://shrijayan.github.io/itwillsync/)** | **[npm](https://www.npmjs.com/package/itwillsync)** | **[Demo Video](https://youtu.be/Zc0Tb98CXh0)**

Sync any terminal-based coding agent to your phone. Local network or Tailscale. Open source, agent-agnostic, zero cloud.

```
npx itwillsync -- claude
npx itwillsync -- aider
npx itwillsync -- bash
```

## How it works

1. Run `itwillsync` with your agent command
2. A QR code appears in your terminal
3. Scan it on your phone — opens a terminal in your browser
4. Control your agent from your phone (or both phone and laptop simultaneously)

## Requirements

- Node.js 20+
- Any terminal-based coding agent (Claude Code, Aider, Goose, Codex, or just `bash`)

## Install & Use

```bash
# Run directly (no install needed)
npx itwillsync -- claude

# Or install globally
npm install -g itwillsync
itwillsync -- aider --model gpt-4
```

On first run, a setup wizard asks how you want to connect — local WiFi or Tailscale. Your choice is saved for future sessions.

## Connect from Anywhere with Tailscale

By default, your phone needs to be on the same WiFi. With [Tailscale](https://tailscale.com), you can connect from anywhere — coffee shop, cellular, different network.

```bash
# First time: the setup wizard will detect Tailscale automatically
itwillsync -- claude

# Or use Tailscale for a single session
itwillsync --tailscale -- claude

# Switch back to local WiFi for a session
itwillsync --local -- claude

# Re-run setup anytime
itwillsync setup
```

**Setup:** Install Tailscale on both your computer and phone. That's it — itwillsync detects it automatically.

## Options

```
Commands:
  setup              Run the setup wizard (change networking mode)

Options:
  --port <number>    Port to listen on (default: 3456)
  --localhost         Bind to 127.0.0.1 only (no LAN access)
  --tailscale         Use Tailscale for this session
  --local             Use local WiFi for this session
  --no-qr            Don't display QR code
  -h, --help         Show help
  -v, --version      Show version
```

## Security

- Each session generates a random 64-character token
- Token is embedded in the QR code URL
- All WebSocket connections require the token
- No data leaves your network (local mode) or your Tailscale tailnet

## Works with

Claude Code, Aider, Goose, Codex, Cline, Copilot CLI, or any terminal-based tool.

## Development

See [docs/development.md](docs/development.md) for architecture, project structure, and contributing guide.

## License

MIT
