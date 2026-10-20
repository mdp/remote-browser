# Persistent Browser Stack

A self-hosted Docker Compose stack that gives agents a real, persistent Chrome
desktop. Chrome runs under KasmVNC so you can watch and interact with it, while
the official [`agent-browser`](https://github.com/vercel-labs/agent-browser) MCP
server attaches over the Chrome DevTools Protocol (CDP). Agent and human share
the same cookies and sign-ins, but automation is pinned to its own tab.

## Services

| Service | Role | Endpoint |
|---|---|---|
| `chrome` | Persistent KasmVNC Chrome 1.19.0 | `https://<BROWSER_BIND_IP>:6901` |
| `cdp-forward` | Bun TCP/WebSocket proxy that fixes Chrome's Host check | `http://chrome:9223`, private Docker network only |
| `mcp` | `agent-browser` native MCP behind Supergateway | `http://<BROWSER_BIND_IP>:8931/mcp` |

- VNC login: user `kasm_user`, password `VNC_PASSWORD`.
- MCP auth: `Authorization: Bearer <BROWSER_MCP_API_KEY>`.
- Raw CDP is not authenticated. It is reachable only from this stack's private
  Docker network and is never published on the host.

## Prerequisites

- Docker Engine with Compose v2.
- [Bun](https://bun.sh) 1.x for the helper scripts and tests (optional if you
  only use `docker compose`).
- Linux or macOS. On Linux, the container user IDs must be able to read and
  write the profile directories.
- About 2 GB of shared memory for Chrome (`shm_size` is set to `2gb`).

## Quick start

```sh
cp .env.example .env
chmod 600 .env
```

Edit `.env`:

1. Set `BROWSER_BIND_IP` to `127.0.0.1` for local-only access, or to a
   Tailscale/LAN address if you need remote access.
2. Set `BROWSER_DATA_DIR` and `BROWSER_AGENT_DATA_DIR` to persistent paths
   outside this repository.
3. Set `VNC_PASSWORD` to a strong password.
4. Generate `BROWSER_MCP_API_KEY` with `openssl rand -hex 32`.
5. Set `LOCAL_UID` / `LOCAL_GID` to the owner of the data directories.

Create the directories, then start the stack:

```sh
mkdir -p /path/to/kasm-browser/{config,profile,Downloads,vnc} /path/to/browser-agent
bun run up            # or: docker compose up -d --build --wait
bun run ps
```

The first start builds the MCP image and waits for all health checks. Chrome's
first launch may take up to a minute.

### VNC

Open `https://<BROWSER_BIND_IP>:6901` (for the default bind address:
`https://localhost:6901`). Accept the self-signed certificate warning, then sign
in as `kasm_user` with `VNC_PASSWORD`. You are controlling the same persistent
Chrome instance the agent uses.

### MCP

Point your MCP client at `http://<BROWSER_BIND_IP>:8931/mcp`, using
**Streamable HTTP** and the Bearer header above. There is no OAuth or client
registration step.

Keep the key out of URLs, logs, and Git. `BROWSER_MCP_API_KEY` is separate from
the VNC password.

## Configuration

All settings are environment variables read from `.env` or the shell. See
`.env.example` for the full list.

| Variable | Default | Purpose |
|---|---|---|
| `BROWSER_BIND_IP` | `127.0.0.1` | Host interface for the VNC and MCP ports |
| `VNC_PASSWORD` | required | KasmVNC password |
| `BROWSER_MCP_API_KEY` | required | Bearer token for the MCP endpoint |
| `KASM_PORT` | `6901` | Host VNC port |
| `BROWSER_MCP_PORT` | `8931` | Host MCP port |
| `BROWSER_MCP_URL` | derived | Optional full MCP endpoint for helper scripts |
| `BROWSER_DATA_DIR` | required | Chrome profile, config, downloads, VNC data |
| `BROWSER_AGENT_DATA_DIR` | required | Agent metadata and pinned-tab state |
| `BROWSER_CDP_URL` | `http://chrome:9223` | CDP endpoint used by the agent |
| `LOCAL_UID` / `LOCAL_GID` | `1000` | Runtime user for the containers |
| `CHROME_HOSTNAME` | `chrome-profile` | Chrome container hostname; keep stable |
| `BROWSER_AGENT_SESSION` | `browser` | agent-browser session name |
| `BROWSER_AGENT_NAMESPACE` | `browser-agent` | agent-browser metadata namespace |

`BROWSER_BIND_IP=0.0.0.0` publishes the ports on every interface. Only do that
behind a firewall or a TLS-terminating proxy.

## Operations

```sh
bun run ps                         # container status
bun run logs                       # recent logs
bun run config                     # render and validate compose.yaml
docker compose up -d --build --no-deps mcp   # update only the MCP adapter
```

- `cdp-forward` shares Chrome's network namespace. If you recreate `chrome`,
  recreate `cdp-forward` too; `bun run up` handles the dependency order.
- Stop Chrome before taking a filesystem backup of its profile.
- Never use `docker compose down -v` as a cleanup shortcut; volumes are not used
  for state, but stopping the whole project still interrupts live sessions.
- Chrome restarts change CDP tab IDs. If the pinned session reports `tab_gone`,
  use `agent_browser_tab_new` to bind a fresh automation tab, or
  `agent_browser_tab_list` and `agent_browser_tab_switch` to select a restored
  one. Do not disable pinning or adopt a random human tab.

## Tool surface

`supergateway.json` exposes the `core` and `tabs` tool groups: 27 tools covering
navigation, snapshots, screenshots, input, waits, evaluation, and tab
management. Whole-browser close, install/upgrade, batch, and state-export tools
are not exposed, and the gateway rejects calls to them as well as hiding them
from discovery.

Navigation, clicks, evaluation, and screenshots are still powerful. This is not
a read-only or hostile-user sandbox. Require approval for purchases, form
submissions, deletions, and other consequential actions, and treat page content
as untrusted data rather than instructions.

## Security notes

- The Chrome profile contains cookies and signed-in sessions. Treat
  `BROWSER_DATA_DIR` and `.env` as secrets, keep them out of Git, and back them
  up carefully.
- Raw CDP gives full browser control with no authentication. It is confined to
  the stack's private Docker bridge; do not add a host port mapping for 9222 or
  9223.
- The MCP service runs unprivileged, drops all capabilities, sets
  `no-new-privileges`, and has no Docker socket or Chrome-profile mount.
- The MCP port is protected only by the Bearer key. If you bind it beyond
  localhost, restrict access with a firewall or Tailscale ACLs and consider
  placing a TLS proxy in front.
- To report a vulnerability, use the repository's GitHub Security Advisories
  rather than a public issue.

## Open WebUI (optional)

`scripts/connect-openwebui.ts` registers this MCP endpoint as an admin-only tool
connection. Set `OPENWEBUI_URL`, `OPENWEBUI_API_KEY`, and the browser variables
in `.env`, then preview and apply:

```sh
bun run connect
bun run connect --apply
```

The script verifies tool discovery first, refuses to overwrite a connection that
points elsewhere, and writes a timestamped backup of the existing tool-server
configuration to `backups/` (gitignored, contains credentials) before saving.

## Development

```sh
bun test                 # config and CDP-forwarder tests
bun run smoke            # live auth/discovery/snapshot/screenshot checks
bun run smoke --exercise # additionally open https://example.com in a new tab
```

The smoke test requires a running stack. It checks that missing/wrong keys are
rejected, verifies the tool list, takes a snapshot and a native MCP screenshot,
and confirms that pre-existing Chrome tabs are unchanged. It does not submit
forms or clear state.

Layout:

```
compose.yaml          three-service stack
Dockerfile            MCP adapter image
supergateway.json     MCP server and tool allowlist
cdp-forward.ts        Host-header-rewriting TCP/WebSocket proxy
kasmvnc.yaml          KasmVNC desktop settings
scripts/              tests, smoke test, Open WebUI helper
```

## License

[MIT](LICENSE). Not affiliated with Kasm Technologies, Google, or the
agent-browser maintainers. Chrome and KasmVNC are distributed under their own
licenses and terms.
