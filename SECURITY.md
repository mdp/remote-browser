# Security Policy

## Reporting a vulnerability

Please report security issues privately through this repository's GitHub
Security Advisories. Do not open a public issue for a vulnerability.

Include reproduction steps, affected files or images, and the impact you
expect. You will receive an acknowledgement and a coordinated disclosure
timeline.

## Scope

This stack intentionally gives a remote client full control of a browser
session:

- Raw CDP has no authentication. It is reachable only on the stack's private
  Docker network and must never be published to the host or the internet.
- MCP is protected by a single Bearer token. Treat the token as a credential and
  restrict the bind address and network access.
- The Chrome profile contains live cookies and signed-in sessions. Keep
  `BROWSER_DATA_DIR`, `.env`, and `backups/` private and out of Git.
- Page content and tool output are untrusted data. Prompt injection against an
  agent with browser control is in scope as a misuse risk, but is not a
  container escape by itself.

Reports about the upstream projects (Chrome, KasmVNC, agent-browser,
Supergateway, Open WebUI) should be sent to their respective maintainers.
