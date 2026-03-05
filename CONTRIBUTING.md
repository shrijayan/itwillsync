# Contributing to itwillsync

Thanks for your interest in contributing to itwillsync! This guide will help you get started.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 22+ (use [nvm](https://github.com/nvm-sh/nvm): `nvm use`)
- [pnpm](https://pnpm.io/) 10+
- Build tools for native modules (`build-essential` on Linux, Xcode CLI tools on macOS)

### Setup

```bash
# Clone the repo
git clone https://github.com/shrijayan/itwillsync.git
cd itwillsync

# Install dependencies
pnpm install

# Build everything (web-client → hub → cli)
pnpm build

# Quick test
node packages/cli/dist/index.js -- bash
```

### Project Structure

```
packages/
  cli/           # Main npm package (itwillsync)
  web-client/    # Browser terminal client (xterm.js, embedded in CLI dist)
  hub/           # Dashboard hub for multi-session management
  landing/       # Landing page / docs site
```

## Development Workflow

1. **Fork** the repo and create a branch from `main`
2. Make your changes
3. Run tests: `pnpm test`
4. Build to verify: `pnpm build`
5. Open a pull request against `main`

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests for a specific package
pnpm --filter itwillsync test
pnpm --filter @itwillsync/web-client test
pnpm --filter @itwillsync/hub test

# Run tests with coverage
pnpm test -- --coverage
```

### Build Order

The packages must be built in order since they embed each other:

1. `@itwillsync/web-client` (Vite)
2. `@itwillsync/hub` (Vite)
3. `itwillsync` CLI (tsup)

Running `pnpm build` at the root handles this automatically.

## What to Contribute

- Bug fixes
- Documentation improvements
- New agent detection support
- Platform compatibility fixes (Windows/Linux/macOS)
- Performance improvements
- Test coverage

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Include tests for new functionality
- Update documentation if your change affects user-facing behavior
- Make sure CI passes (tests + build)
- Write clear commit messages

## Reporting Bugs

Open an [issue](https://github.com/shrijayan/itwillsync/issues) with:

- Steps to reproduce
- Expected vs actual behavior
- Your OS, Node.js version, and terminal
- Any error output

## Code Style

- TypeScript with ESM modules
- No specific linter enforced yet — follow existing patterns
- Keep dependencies minimal

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
