# Security notes

Kangaroo Trainer holds a child's learning data and copyrighted contest papers. It is private by default.

## Threat model (home network)

| Concern | What we do |
| --- | --- |
| Someone outside the house | Not reachable: no router port forwarding, and Caddy refuses non-private client addresses. |
| Another device on the Wi-Fi | HTTPS only; PIN sign-in; the parent is needed for every change to profiles. |
| A child guessing a PIN | 5 wrong tries lock the profile for 5 minutes (parent: 15). Requests are rate-limited per device. |
| Someone claiming "parent" on first run | Needs the one-time setup code, which is printed only in the server log on the Mac. |
| A stolen session cookie | `HttpOnly`, `Secure`, `SameSite=Strict`. Only a SHA-256 hash of the token is stored. Students: 8 h max; parent: 30 min idle. |
| Cross-site tricks (CSRF, framing, injected scripts) | Origin check on every state-changing request; strict CSP (`default-src 'self'`, no inline scripts, `frame-ancestors 'none'`). |
| Path tricks on picture URLs | Strict filename pattern, plus a check that the path stays inside the image folder. Pictures only for signed-in users. |
| A compromised dependency | Exact versions in a lockfile; Dependabot; `npm audit` in CI; no build tools in the running image. |
| Known holes in the operating system | Both images are Google's "distroless" images: no shell, no package manager, no npm. Caddy is compiled from its official release with the latest patched Go. CI scans both images with Trivy and fails on a fixable critical issue. Rebuild monthly (`docker compose build --pull`, then `docker compose up -d`) to pick up fixes. |
| A container escape | Non-root user, `cap_drop: ALL`, `no-new-privileges`, read-only root filesystem, no ports on the app container. |

## Data kept per student

Nickname, avatar, grade, birth year, PIN hash, and practice events (answers, times, scores). No names, emails, photos or location. The parent can delete a student, which also deletes all of that student's history.

## Reporting

This is a family project. Please report a security problem privately: **Security** tab → **Report a vulnerability**. Don't open a public issue for it.
