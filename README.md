# Persistent KasmVNC Chrome

**A browser that stays signed in—available from your desktop or tailnet, with a
local-only automation port.** This project runs one persistent Chrome profile
inside KasmVNC and exposes Chrome DevTools Protocol (CDP) on loopback for local
automation.

> **Treat this like an unlocked computer.** The desktop can access signed-in
> sessions, and CDP can fully control Chrome. Use a strong VNC password, and
> never expose port `9222` to your network.

## Quick start

Requirements: Docker Engine with the Compose plugin, and a Tailscale IPv4
address for access from other tailnet devices.

```sh
cd browser
cp .env.example .env
```

Edit `.env`: set `TAILSCALE_IP` to the host's Tailscale IPv4 address (get it
with `tailscale ip -4`), choose a strong `VNC_PASSWORD`, and point
`BROWSER_DATA_DIR` somewhere private and outside Syncthing. Then start it:

```sh
docker compose up -d
```

Open **https://localhost:6901** on the host or **https://<TAILSCALE_IP>:6901**
from a device on your tailnet. Sign in as `kasm_user` with the password from
`.env`. The browser presents a self-signed HTTPS certificate by default, so
your browser will show a certificate warning; Tailscale encrypts tailnet
traffic.

Chrome automation tools can connect locally to **http://127.0.0.1:9222**.

## What’s running

| Container | Role |
| --- | --- |
| `browser-chrome` | Chrome desktop and KasmVNC web interface |
| `browser-cdp-forward` | Loopback-friendly CDP proxy; rewrites the `Host` header Chrome expects |

The desktop is fixed at **1920 × 1080**. Chrome’s profile and settings are
persisted on the host, so they survive container restarts and image updates.
The Compose file pins the image to `kasmweb/chrome:1.19.0`.

### Ports and reachability

| Host port | Service | Reachable from |
| --- | --- | --- |
| `6901` | KasmVNC desktop (HTTPS, password-protected) | Host and configured Tailscale IP |
| `9222` | Chrome CDP (unauthenticated, full browser control) | Host only (`127.0.0.1`) |

Both host ports can be changed in `.env` with `KASM_PORT` and
`CDP_HOST_PORT`. **Keep CDP loopback-only**: anyone who can reach it can control
the browser and its signed-in sessions.

## Your browser profile

By default, browser data goes under `browser/data`. For a private, unsynced
location, set an absolute path in `.env`, for example:

```dotenv
BROWSER_DATA_DIR=/home/your-user/.local/share/kasm-browser
```

The directory holds Chrome’s profile, configuration, downloads, and VNC
settings. Back it up only while Chrome is stopped, and never run two Chrome
instances against the same profile. Deleting the directory deletes the saved
browser state. To move an existing profile, stop Chrome and copy its
user-data directory into `<BROWSER_DATA_DIR>/profile`; sites may still ask you
to sign in again.

The fixed screen size and resize behavior are configured in `kasmvnc.yaml`.
To change the size, update `desktop.resolution.width` and `height`, keep
`desktop.allow_resize: false`, then recreate the container.

## Day-to-day

Run these commands from `browser/`:

```sh
docker compose logs -f          # follow startup and runtime logs
docker compose restart          # restart without deleting browser data
docker compose down             # stop and remove containers
docker compose up -d            # start again
```

## Keep it safe

- `.env` contains the desktop password and machine-specific address; keep it
  private. It is ignored by Git.
- Keep `BROWSER_DATA_DIR` private and out of synced folders and public repos.
- Never publish CDP (`9222`) on a LAN, tailnet, or public interface.
- Don’t commit browser profiles, credentials, downloads, certificates, or
  machine-specific configuration. `.env.example` is the shareable template.
