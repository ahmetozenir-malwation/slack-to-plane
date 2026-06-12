# slack-plane-bridge

Slack `/plane` slash command → self-hosted Plane API bridge. Lets Slack users create Plane issues via a modal without exposing Plane's IP-restricted API.

## Architecture

- `slack-plane-bridge` — Node 20 + Bolt service handling Slack webhooks
- `cloudflared` — sidecar tunnel exposing the bridge at `https://slack-plane.example.com`
- Per-user Plane PAT, stored AES-256-GCM-encrypted in SQLite

### Issue modal fields

`/plane` opens a modal with: Project, Title, Description, State, Priority, Start
date, Due date, Cycle, Modules, Estimate, Assignees, Labels. Cycle, Modules and
Estimate appear only after a project is selected, and are hidden when the project
has none configured. On success the task's title + link is posted **into the
channel or DM where `/plane` was run** (visible to everyone there), not just to
the creator.

## Local development

```bash
cp .env.example .env
# Fill in SLACK_SIGNING_SECRET, SLACK_BOT_TOKEN, PLANE_TOKEN_ENCRYPTION_KEY (32-byte base64)
npm install
npm run dev
```

Generate a PLANE_TOKEN_ENCRYPTION_KEY:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

For local Slack testing, use `cloudflared tunnel --url http://localhost:3000 --protocol http2 ` and put the URL into the manifest's request URLs.

### Run locally in Docker (optional)

The same `docker-compose.yml` runs the bridge in a container. cloudflared is
behind the `tunnel` profile, so a plain `up` starts only the bridge — run the
tunnel by hand as above. Keep `PLANE_API_BASE=http://plane.example.com` in `.env`.

```bash
docker network create plane_default   # once; the compose network is external
docker compose up --build
```

## Testing

```bash
npm test               # all tests
npm run test:watch     # watch mode
npm run lint           # biome check
npm run typecheck      # tsc --noEmit
```

## Production deploy (Plane host)

### 1. Slack App

1. Open https://api.slack.com/apps → "Create New App" → "From an app manifest" → workspace = your workspace.
2. Paste `slack-manifest.yml` content.
3. After creation, copy:
   - **Signing Secret** (Basic Information page)
   - **Bot User OAuth Token** (OAuth & Permissions page, starts with `xoxb-`)
4. Install the app into your workspace.

### 2. Cloudflare Tunnel

1. Cloudflare dashboard → Zero Trust → Networks → Tunnels → "Create a tunnel".
2. Choose "cloudflared", name it `slack-plane-bridge`.
3. Copy the **tunnel token** shown on screen (long string starting with `eyJ...`).
4. Add a **public hostname**:
   - Subdomain: `slack-plane`
   - Domain: `example.com`
   - Service: `HTTP` → `slack-plane-bridge:3000`

### 3. Secrets

Put these in vaultbridge (or `.env` on the Plane host):

| Var | Value |
|---|---|
| `SLACK_SIGNING_SECRET` | from step 1 |
| `SLACK_BOT_TOKEN` | from step 1 |
| `PLANE_TOKEN_ENCRYPTION_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `CLOUDFLARE_TUNNEL_TOKEN` | from step 2 |
| `PLANE_WORKSPACE_SLUG` | `your-workspace` (or override) |
| `PLANE_WEB_BASE` | `http://plane.example.com` |

### 4. Run on the Plane host

The single `docker-compose.yml` works on both your dev machine and the Plane
host. On the host, the `plane_default` network already exists (created by
Plane's stack), and the `tunnel` profile starts cloudflared alongside the bridge.

Set `PLANE_API_BASE=http://plane-api:8000` in `.env` so the bridge reaches Plane
over the internal network.

```bash
# From the slack-plane-bridge directory on the Plane host
docker compose --profile tunnel up -d --build
docker compose logs -f slack-plane-bridge
```

Verify:

```bash
docker compose ps slack-plane-bridge cloudflared
curl -fsS https://slack-plane.example.com/health   # should return {"status":"ok"}
```

### 5. Final Slack App config

In Slack App dashboard, ensure these URLs all point to your tunnel:
- Slash Commands → `/plane` → request URL = `https://slack-plane.example.com/slack/events`
- Interactivity & Shortcuts → request URL = `https://slack-plane.example.com/slack/events`

## Operations

### Backup

The SQLite file is bind-mounted to `./data/bridge.db` next to the compose file.
Add to Plane's backup script:

```bash
docker compose exec slack-plane-bridge sqlite3 /data/bridge.db ".backup '/data/bridge.db.bak'"
docker cp slack-plane-bridge:/data/bridge.db.bak ./backups/bridge-$(date +%F).db
```

### Logs

```bash
docker compose logs -f slack-plane-bridge
```

Structured JSON; pipe to `jq` for human-readable.

### Rollback

```bash
docker compose pull slack-plane-bridge:<previous-tag>
docker compose up -d slack-plane-bridge
```

SQLite schema is forward-compatible (additive). For breaking migrations, restore the prior backup first.

## Open questions (verify at deploy time)

- vaultbridge API contract (currently using `EnvKeyProvider`; swap to `VaultBridgeKeyProvider` once the integration is known).
- Plane self-hosted API auth header — code assumes `X-Api-Key`; verify on staging Plane.
- Plane state has a `default: true` flag — confirm in API response.
- Plane compose internal name and port (assumed `plane-api:8000`).

See spec § 11 for full list.
