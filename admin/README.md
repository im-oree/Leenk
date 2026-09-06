# Leenk Admin

Internal console for the Leenk platform. **Deploy this separately from the
student app**, on its own origin, behind whatever network controls you use
(VPN, IP allowlist, SSO proxy). Keeping it on a different host is the point:
a compromise of the public app must not reach these endpoints.

This directory is a self-contained app — copy it into its own repository and
delete it from the Leenk repo.

```bash
npm install
npm run dev      # http://localhost:5174
npm run build    # -> dist/
```

## Configuration

| Variable | Purpose |
|---|---|
| `VITE_ADMIN_API_BASE` | Leenk API base URL. Defaults to `/api` (proxied to `:5100` in dev). |

The backend requires `ADMIN_KEY` to be set; without it the entire admin API
returns `503 NO_ADMIN_KEY` rather than defaulting to open.

## Security posture

- The admin key is held in `sessionStorage`, not `localStorage`, so it dies
  with the tab.
- Provider **secrets are never sent to or displayed in this console.** It
  stores public client ids only; secrets live in the backend environment and
  are redacted from every API response.
- Every state-changing action writes to `adminAudit` **before** responding —
  an action that wasn't recorded didn't happen.
- `<meta name="robots" content="noindex, nofollow">` is set, but that is a
  courtesy, not a control. Put real access control in front of this.

## Pages

| Page | What it does |
|---|---|
| Dashboard | Live counts and environment state |
| Verification queue | Human decisions on face/ID submissions. Machine scores are advisory only. |
| Users | Search, suspend, ban. Every action needs a reason and is audited. |
| Finance & pricing | Edit plan prices in naira; stored as kobo. Takes effect immediately, never mid-cycle. |
| Features | Kill switches, applied within the 60s config cache |
| Login providers | Toggle Google / StudentHub / Apple / Snapchat / TikTok |
| Audit log | Append-only record of admin actions |
