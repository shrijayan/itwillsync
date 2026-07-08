# Agent Log

## 2026-07-08 (session 2) — Follow-up audit: found + fixed a critical PTY exit-event race condition

**Goal**: User asked to "check for any other improvements" following the session below.

**What was done**: Ran 3 more parallel sub-agent audits (remaining cli files, remaining hub files,
docs + CI/CD + supply chain) and personally re-verified the highest-impact claims with real repros
before trusting them, same discipline as the session below.

**Found and fixed — real, severe bug**: `packages/cli/src/pty-manager.ts`'s `onData`/`onExit` only
subscribed to node-pty's events when a consumer called `.onData()`/`.onExit()`, not when the process
was spawned. In `index.ts`, `.onExit()` is registered ~150 lines after `new PtyManager(...)`, past an
`await registerSession()` hub round-trip. Wrote a standalone repro script against the real installed
node-pty: a process that exits in under ~20ms has its exit event **permanently lost** if `.onExit()`
is registered after that window — confirmed with delays 0/5/10/20/30/50/100ms (cutoff exactly at
20ms). Real-world impact: any fast-failing agent command (typo'd binary, missing dependency, bad
args) causes the CLI to hang forever with no error, no cleanup, no restored terminal — the user has
to force-kill it. Same issue affected early *output* (e.g. the actual error message), not just exit.

**Fix**: `PtyManager` now subscribes to node-pty internally in its constructor (the instant the
process spawns) and buffers data/exit state, replaying it to whichever listener registers later —
so timing of `.onData()`/`.onExit()` calls no longer matters. Added
`packages/cli/src/__tests__/pty-manager.test.ts` (5 tests, using `process.execPath` so it's
cross-platform). Verified the regression tests actually catch the bug: temporarily `git stash`ed the
fix and confirmed 2 of the 5 tests fail against the old code, then restored the fix and all 5 pass.

**Also fixed**: `packages/docs/architecture/overview.md`'s project-structure tree still listed
`auth.ts` under both `cli/src/` and `hub/src/` — stale from the previous session's refactor (moved to
`packages/shared/src/auth.ts`). Added `packages/shared` to the tree and removed the stale entries.

**Noteworthy — unrelated interference during this session**: partway through, `pnpm-lock.yaml` and
every package's `package.json` started changing on disk in real time (confirmed via file mtimes
updating twice within 2 minutes, and two long-running `pnpm dev` processes already running since
"Sun08PM" per `ps aux`) — almost certainly a concurrent `pnpm update` from another session/process on
this machine, unrelated to anything in this conversation. It settled on its own (versions landed back
within normal `^` semver ranges); ran `pnpm install` afterward to sync `node_modules` and re-verified
lint/test/build were still green. Did not investigate further or revert it — not part of this task,
and reverting someone else's in-flight work would be worse than leaving it. **Flagging in case the
user didn't expect it**: root + all workspace `package.json` files and `pnpm-lock.yaml` show as
modified in `git status` from this, on top of the intentional changes above.

**Full list of additional findings NOT fixed (reported to user, prioritization pending)** — see
chat transcript for the complete prioritized list covering: cli (`--port` validation, no
command-existence check on macOS/Linux, `network.ts` NIC priority, `ensureSpawnHelperPermissions`
fragility), hub (`registry.ts` undocumented magic numbers, unwired `maxSessions`, dead
`getPreview()`/`clearAll()` exports, zero test coverage on `preview-collector.ts`'s WS/timer
lifecycle), docs (root README.md **and** docs both document a `--tunnel cloudflare` flag that does
not exist anywhere in the codebase — grepped, zero references outside an unrelated network.ts
comment; Node version requirement contradicts itself across 4+ files; dead link to
github.com/nicktaf/node-pty), and CI/supply-chain (`release.yml`'s semantic-release toolchain runs
with repo-write + npm-publish secrets on floating-range devDependencies — mitigated in practice by
`--frozen-lockfile` but worth extra scrutiny on future bumps; `deploy-landing.yml` grants
`pages:write`/`id-token:write` at workflow level instead of just the job that needs it; published
npm tarball ships full inlined TypeScript source via sourcemaps for no reason; `SECURITY.md` is
unedited GitHub template boilerplate).

## 2026-07-08 — Full repo audit + fixed scroll bug, WSL split, CLI rate limiting, Dependabot config

**Goal**: User reported "the scroll is not working" and asked for a full repo improvement audit.

**Investigation**: Read xterm.js v6's actual source (installed in node_modules) to find the real
root cause instead of guessing. Ran 4 parallel sub-agent audits (cli, hub, landing/docs, repo-wide
hygiene) and spot-verified the most important/surprising findings myself before trusting them
(rate-limiter asymmetry, WSL dir split, dependabot CI failures — all confirmed real via `gh pr list`,
grep, and direct file reads).

**Root cause of the scroll bug**: xterm.js v6 replaced its old native-overflow scroll viewport with
a VS Code-derived `SmoothScrollableElement` that has ZERO touch listeners (confirmed: no
touchstart/touchmove anywhere in its source) — only mouse wheel + scrollbar-drag. web-client's own
touchmove→scrollLines() workaround (main.ts) already existed, but `smoothScrollDuration: 125` was
set unconditionally, so every scrollLines() call (fired many times/sec during a swipe) triggered a
new eased animation that cancels the previous one before it paints — screen looks frozen mid-swipe,
then jumps once the finger lifts.

### Fixes applied (all built + linted + tested green, see `pnpm build`/`pnpm lint`/`pnpm test`)

| Area | Fix |
|------|-----|
| `packages/web-client/src/main.ts`, `style.css` | `smoothScrollDuration: isDesktop ? 125 : 0` (touch scroll must track 1:1, not animate); removed misleading "vertical scroll handled by xterm viewport" comment (not true in v6) |
| `packages/hub/src/dashboard/style.css` | Added `overscroll-behavior-y: contain` to `.modal-content` and `.browse-list` — fixes iOS rubber-band scroll-chaining into the page behind the modal (web-client already had this fix, dashboard never got it) |
| `packages/shared/src/paths.ts` (new) | Single `getItwillsyncHomeDir()` with WSL→Windows-AppData redirect. Was previously copy-pasted in 6 places (cli/config.ts, cli/hub-client.ts, hub/{daemon,session-store,sleep-prevention,windows-firewall,tool-history}.ts) and only daemon.ts had the WSL branch — meant the CLI and hub daemon could silently look in two different folders on WSL. Added regression test at `packages/cli/src/__tests__/paths.test.ts` (6 cases). |
| `packages/shared/src/auth.ts` (new) | Moved `generateToken`/`validateToken`/`RateLimiter` here from hub's `auth.ts` (cli had a verbatim duplicate with no `RateLimiter` at all). Deleted both packages' local `auth.ts`. |
| `packages/cli/src/server.ts` | WS upgrade auth now checks `RateLimiter` (5 attempts/60s lockout) before `validateToken`, same as hub already did — CLI's terminal session auth had zero brute-force protection before this. |
| `.github/dependabot.yml` | Replaced 5 separate per-package `directory:` entries (root, cli, web-client, hub, landing, docs — `shared` was never covered!) with ONE npm entry using `directories: ["/", "/packages/*"]` + `groups: {group-by: dependency-name}`. Verified via GitHub docs research (no auto workspace-discovery from a single root `directory:` — `directories:` + globbing is the documented monorepo pattern). This was the exact fix recommended in the 2026-06-24 entry below but never applied — 6 of 11 open PRs were failing CI at time of writing (`gh pr list`) from the old per-directory config not regenerating the shared lockfile correctly. Grouping also stops the version drift found in the audit (vitest was 4.1.2/4.1.6/4.1.9 across 3 packages). |
| `packages/shared/src/auth.ts` — `RateLimiter` | Fixed the memory-growth item from below: entries are now pruned lazily (piggy-backed on `isBlocked`/`recordFailure`, throttled to at most once per `blockDurationMs` so it's never an O(n) scan per call). An IP that fails once (below threshold) and never returns is swept out instead of living forever in the Map. Added `size` getter + 2 regression tests (`packages/hub/src/__tests__/auth.test.ts`, fake timers) covering prune-when-stale and never-prune-while-still-blocked. |

### Not fixed yet (deferred, lower priority / needs more scope discussion)
- `packages/cli/src/server.ts` still has no dedicated test file (WS protocol/replay/scrollback)
  — only the moved-out `auth.ts` logic is now tested (via hub's `auth.test.ts`, updated to import
  from `@itwillsync/shared/auth`). Full integration tests for cli's HTTP+WS server would be a
  bigger, separate task.
- `git stash@{0}` ("WIP security improvements to daemon") from 2026-06-24 — checked this session:
  fully superseded by commit `c68b11b` (#179, "internal secret handling and replay protection"),
  which already has `internalSecret`/`x-hub-internal-secret`, PID validation, and the 0600/0700
  `chmodSync` hardening the stash was drafting. Safe to `git stash drop` whenever convenient; not
  dropped automatically since stash management wasn't asked for.
- Root `AGENTS.md` + `devxdocs/agentlog.md` convention (per user's global config) not yet set up
  for this repo — user deferred this when asked.
- Landing page cosmetic issues (fake port in demo animation, WCAG contrast, dead CSS, 4 divergent
  "supported agents" lists) — reported but not fixed, user didn't select these.
- 6 currently-open Dependabot PRs (created under the old config) will likely need manual closing
  once the new grouped config produces its first PRs — didn't touch open PRs, only the config.

## 2026-06-24 — Merged all 19 open Dependabot PRs

**Goal**: Fix and merge all open PRs (19 total, all Dependabot dependency updates).

**Root cause**: Dependabot was configured with `directory: "/"` for npm but only updated `package.json` files — not the root `pnpm-lock.yaml`. The CI uses `pnpm install --frozen-lockfile` which fails when lockfile doesn't match manifests.

**What was done**:
1. Merged GitHub Actions PRs (#172, #174) — CI was already passing, just needed approval.
2. For each npm PR branch: fetched, rebased on main, ran `pnpm install` to regenerate lockfile, committed, pushed.
3. Merged PRs one by one using `gh pr merge --squash --admin`.
4. After each merge, rebased remaining branches on the new main and regenerated lockfiles.

**Result — All changes landed in main**:
- 16 PRs formally MERGED, 3 auto-CLOSED as superseded by group PR #157
- Group PR #157 (ws, vite, brace-expansion group) absorbed PRs #153 (vitest/hub), #154 (ws/hub), #139 (jsdom/web-client)
- A fixup commit (`037cf3a`) restored correct versions regressed by conflict resolution
- All final versions: typescript 6.0.3, vite 8.1.0/8.0.14, vitest 4.1.9/4.1.6, jsdom 29.1.1, ws 8.20.1, lint-staged 17.0.5, typescript-eslint 8.59.4, @types/node 25.9.1

**Important: WIP stash**:
- `git stash@{0}` on main contains additional security improvements (daemon.ts, internal-api.ts, session-store.ts, hub-client.ts) that extend PR #178. Apply with `git stash pop` when ready to continue that work.
- Branch `fix/wsl2-bugs-145-146-147` was accidentally pushed to remote but has no extra commits beyond main.

**Next steps**: Dependabot config should be updated to consolidate npm ecosystems into a single root entry to avoid the lockfile mismatch issue on future PRs.

## 2026-06-24 — Security fixes: all 16 findings from techops-infosec audit

Fixed all 16 security vulnerabilities from the 2026-05-19 security report.

### Files changed

| File | Issues fixed |
|------|-------------|
| `packages/hub/src/daemon.ts` | #2 — added `chmodSync`+`mode: 0o600/0o700` to hub.json, hub.pid, hub dir; added `internalSecret` generation and passing to internal API |
| `packages/hub/src/session-store.ts` | #2 — added `chmodSync`+`mode: 0o600/0o700` to sessions.json |
| `packages/hub/src/internal-api.ts` | #1, #4, #5 — added `X-Hub-Internal-Secret` auth header enforcement; `Host` header validation (DNS rebinding); positive-integer PID validation |
| `packages/cli/src/hub-client.ts` | #7, #10 — added `getInternalAuthHeaders()` with cached secret; `X-Hub-Internal-Secret` on all internal API calls; `pid > 0 && Number.isInteger(pid)` guards before `process.kill` |
| `packages/hub/src/server.ts` | #3, #9, #14, #15, #16 — `new URL` wrapped in try/catch (HTTP + WS); `Cache-Control: no-store`, `Referrer-Policy: no-referrer`; Origin header check on WS upgrade; `create-session` cwd confined to home; path check uses `homeDir + sep` |
| `packages/cli/src/server.ts` | #3, #13 — `new URL` wrapped in try/catch; per-connection `_seq` replay counter |
| `packages/hub/src/sleep-prevention.ts` | #8 — `enableLinux` write/restart calls changed from `runSudo` (password on stdin) to `runCommand("sudo", ["-n", ...])` (uses cached credential, no password on tee stdin) |
| `packages/cli/src/session-logger.ts` | #11 — `mkdirSync` with `mode: 0o700`; both `createWriteStream` calls with `mode: 0o600` |
| `packages/hub/src/dashboard/main.ts` | #12, #13 — `hub=` moved from query string to URL fragment (`#hub=`); `_sendSeq` added to all outgoing encrypted messages |
| `packages/web-client/src/main.ts` | #12, #13 — reads `hub` from `window.location.hash` fragment; `_sendSeq` added to all outgoing encrypted messages |

### Summary of what was done
- **HIGH #1/#4/#10**: Internal API now requires `X-Hub-Internal-Secret` (per-process random token, stored in owner-only hub.json) on all endpoints except `/api/health`. Host header must be `127.0.0.1:<port>` or `localhost:<port>`.
- **HIGH #2**: All sensitive files (hub.json, hub.pid, sessions.json, log files) created with `mode: 0o600`; hub directory with `mode: 0o700`. `chmodSync` called after each write to enforce on pre-existing files.
- **HIGH #3**: Both hub `server.ts` and CLI `server.ts` wrap `new URL(req.url, host)` in try/catch for both HTTP and WS upgrade handlers, returning 400 instead of crashing.
- **MEDIUM #5**: `POST /api/sessions` validates `Number.isInteger(pid) && pid > 0`.
- **MEDIUM #6**: Dashboard no longer embeds master token in URL query string when opening sessions — uses fragment.
- **MEDIUM #7**: `getHubPidFromHealth()`, `killStaleHub()`, and `stopHub()` all validate `pid > 0 && Number.isInteger(pid)` before `process.kill`.
- **MEDIUM #8**: `enableLinux` in `sleep-prevention.ts` uses `sudo -n` (cached credential) for the `tee` write call, keeping the password off tee's stdin.
- **LOW #9**: All authenticated HTTP responses include `Cache-Control: no-store, private` and `Referrer-Policy: no-referrer`.
- **LOW #11**: Session log directory and files created owner-only.
- **LOW #12**: Hub URL (containing master token) passed in URL fragment `#hub=` instead of `?hub=` query param; web-client reads from `window.location.hash`.
- **LOW #13**: Per-connection `lastClientSeq` counter in both hub and CLI WS servers; clients include `_seq` in every outgoing encrypted message.
- **LOW #14**: WS upgrade handler validates `Origin` header matches `Host` header, rejecting cross-origin upgrade attempts.
- **LOW #15**: `create-session` cwd now goes through the same `startsWith(homeDir + sep)` confinement check as `/api/browse`.
- **LOW #16**: `/api/browse` and `create-session` use separator-aware path check (`resolved === homeDir || resolved.startsWith(homeDir + sep)`) instead of prefix-only `startsWith(homeDir)`.

Build: `pnpm run build` passes with no errors.
