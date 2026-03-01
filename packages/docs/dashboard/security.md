# Security Model

itwillsync is designed for local network use. All communication stays on your WiFi or Tailscale VPN. No data is sent to any cloud service.

## Token Authentication

Every endpoint requires a cryptographic token for access.

### Token Hierarchy

| Token | Scope | How you get it |
|-------|-------|----------------|
| Master token | Dashboard access (all sessions) | QR code on first session start |
| Session tokens | Individual terminal access | Delivered by dashboard over WebSocket |

Tokens are 64-character hex strings (256 bits of entropy). They're generated using `crypto.randomBytes(32)` and validated with constant-time comparison (`timingSafeEqual`) to prevent timing attacks.

### What this means in practice

- Knowing an IP + port is not enough — you need the token
- The token is embedded in the QR code URL
- Someone port-scanning your machine sees an HTTP server but can't access anything without the token
- Brute-forcing a 256-bit token would take longer than the age of the universe

## Rate Limiting

If someone tries to connect with an incorrect token:
- 5 failed attempts from the same IP triggers a 60-second lockout
- During lockout, all requests from that IP return HTTP 429

The legitimate user (who has the token from the QR code) never triggers this.

## Network Boundaries

| Interface | Binding | Auth | Purpose |
|-----------|---------|------|---------|
| Dashboard server | 0.0.0.0:7962 | Master token | Phone access |
| Internal API | 127.0.0.1:7963 | None (localhost only) | Session registration |
| Session servers | 0.0.0.0:dynamic | Session token | Terminal access |

The internal API is bound to `127.0.0.1` — only processes on your machine can reach it. This is an OS-level guarantee.

## Static Assets

Dashboard JavaScript and CSS files are served without token validation. These are bundled build artifacts containing no sensitive data. Security is enforced on the WebSocket connection, which always requires the master token.
