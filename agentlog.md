# Agent Log

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
