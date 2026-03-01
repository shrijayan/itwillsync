# Contributing

## Setup

```bash
# Clone the repo
git clone https://github.com/shrijayan/itwillsync
cd itwillsync

# Use Node 22 (required for node-pty)
nvm use

# Install dependencies
pnpm install

# Run tests
pnpm test

# Build everything
pnpm build

# Test it
node packages/cli/dist/index.js -- bash
```

## Build Order

The packages must build in this order:

```bash
pnpm build
# Runs: web-client → hub → cli
```

Each package embeds the previous one's output:
- CLI embeds web-client dist at `dist/web-client/`
- CLI embeds hub dist at `dist/hub/`

## Testing

Tests use [Vitest](https://vitest.dev/) with global mode.

```bash
pnpm test                          # All packages
pnpm --filter itwillsync test      # CLI tests only
pnpm --filter @itwillsync/hub test # Hub tests only
```

### Test structure

- `packages/cli/src/__tests__/` — CLI argument parsing, config, networking, Tailscale
- `packages/hub/src/__tests__/` — Registry, auth, rate limiting, internal API, session management, preview collector
- `packages/web-client/src/__tests__/` — Notification system

## Development Workflow

```bash
# Start dev mode (watch all packages)
pnpm dev

# Start docs dev server
pnpm docs:dev

# Quick test after build
node packages/cli/dist/index.js -- bash
node packages/cli/dist/index.js hub info
```

## Key Technical Notes

- **node-pty**: The `spawn-helper` binary needs execute permissions. This is handled automatically at PTY init time.
- **tsup config**: `node-pty` and `qrcode-terminal` are external (native/legacy modules). `ws` is bundled.
- **Config location**: `~/.itwillsync/config.json`. Override with `ITWILLSYNC_CONFIG_DIR` env var.

## Pull Request Process

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Run `pnpm test && pnpm build` to verify
5. Open a PR against `main`
