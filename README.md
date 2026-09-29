# Persistent KasmVNC Chrome

A single persistent Google Chrome desktop using KasmVNC, with a localhost-only
Chrome DevTools Protocol (CDP) endpoint for local automation. This directory is
designed to become a standalone repository and, later, a submodule of its parent
workspace.

## What runs

- `kasmweb/chrome:1.19.0` provides Chrome and KasmVNC.
- Chrome's user data directory is persisted at `${BROWSER_DATA_DIR}/profile`.
- KasmVNC is reachable on localhost and the configured Tailscale IP.
- CDP is forwarded to `http://127.0.0.1:9222` by default. CDP has no
  authentication and can control the entire browser, so it is deliberately not
  exposed on Tailscale or other network interfaces.

## Configure and start

```sh
cp .env.example .env
# Edit .env: set TAILSCALE_IP, choose a strong VNC_PASSWORD, and set
# BROWSER_DATA_DIR to a private path outside Syncthing (recommended).
docker compose up -d
```

Open `https://localhost:6901` locally, or `https://<TAILSCALE_IP>:6901` from a
device on the tailnet. At the browser's authentication prompt, use username
`kasm_user` and the password in your local `.env` (`VNC_PASSWORD`). Its HTTPS
certificate is self-signed unless you configure your own certificate; the
tailnet connection is also encrypted by Tailscale.

The Chrome CDP endpoint is `http://localhost:9222`. For example, local browser
automation can connect to that endpoint. Do not bind CDP to a network interface:
it has no authentication and grants full browser control, including access to
signed-in sessions.

## Persistent browser state

Use a private `BROWSER_DATA_DIR`, ideally outside any synced folder, for example:

```dotenv
BROWSER_DATA_DIR=/home/your-user/.local/share/kasm-browser
```

The profile, Chrome settings, downloads, and KasmVNC files live below that path.
They survive container recreation and image updates. Stop the browser before
backing up or copying its profile. Do not run two Chrome instances against the
same profile. Deleting this directory deletes the saved browser state.

To retain an existing Kasm Chrome profile, copy its user-data directory into
`${BROWSER_DATA_DIR}/profile` while Chrome is stopped. Site cookies and other
local profile data generally persist; individual websites may still require
reauthentication. Chrome Sync and website login sessions are separate features.

## Ports

| Host port | Service | Binding |
| --- | --- | --- |
| `6901` | KasmVNC web UI (HTTPS; Basic Auth) | localhost + configured Tailscale IP |
| `9222` | Chrome CDP | localhost only |

Override the host ports in `.env` if they are already in use. Do not publish
CDP beyond localhost unless you add a separately secured access layer.

## Repository hygiene

`.env` and browser state are ignored by Git. Commit only source/configuration and
the placeholder `.env.example`; never commit profiles, credentials, downloads,
certificates, or machine-specific addresses. The parent workspace temporarily
ignores this directory while it is prepared as an independent repository. Once
the public remote exists, register it as a Git submodule.
