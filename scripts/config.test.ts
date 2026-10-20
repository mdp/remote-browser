import { expect, test } from 'bun:test';
import { resolve } from 'node:path';

const dir = resolve(import.meta.dir, '..');
const gateway = await Bun.file(resolve(dir, 'supergateway.json')).json();
const compose: any = Bun.YAML.parse(await Bun.file(resolve(dir, 'compose.yaml')).text());

test('uses the official native MCP with a fixed, limited tool list', () => {
  const server = gateway.mcpServers.browser;
  expect(server.command).toBe('agent-browser');
  expect(server.args).toEqual(['mcp', '--tools', 'core,tabs']);
  expect(server.outputTransport).toBe('streamableHttp');
  expect(server.stateful).toBe(true);
  expect(server.tools).toHaveLength(27);
  expect(new Set(server.tools).size).toBe(27);
  for (const forbidden of ['agent_browser_close', 'agent_browser_install', 'agent_browser_upgrade', 'agent_browser_batch']) {
    expect(server.tools).not.toContain(forbidden);
  }
});

test('requires a secret and attaches to the VNC Chrome without profile sharing', () => {
  const service = compose.services.mcp;
  expect(service.environment.SUPERGATEWAY_API_KEY).toContain(':?');
  expect(service.environment.AGENT_BROWSER_CDP).toContain('chrome:9223');
  expect(service.environment.AGENT_BROWSER_PIN_TAB).toBe('1');
  expect(service.network_mode).toBeUndefined();
  expect(service.ports).toEqual(['${BROWSER_BIND_IP:-127.0.0.1}:${BROWSER_MCP_PORT:-8931}:8931']);
  expect(service.volumes).toHaveLength(1);
  expect(service.volumes[0]).toContain('/home/node/.agent-browser');
  expect(service.volumes.join()).not.toContain('kasm-browser');
  expect(service.volumes.join()).not.toContain('docker.sock');
  expect(gateway.host).toBe('0.0.0.0');
});

test('one stack owns VNC, private CDP, and MCP; profile stays outside source', () => {
  expect(compose.name).toBe('browser');
  expect(Object.keys(compose.services).sort()).toEqual(['cdp-forward', 'chrome', 'mcp']);
  const chrome = compose.services.chrome;
  expect(chrome.hostname).toBe('${CHROME_HOSTNAME:-chrome-profile}');
  expect(chrome.environment.APP_ARGS).toContain('--restore-last-session');
  expect(chrome.ports).toEqual(['${BROWSER_BIND_IP:-127.0.0.1}:${KASM_PORT:-6901}:6901']);
  expect(chrome.expose).toEqual(['9223']);
  expect(chrome.volumes.join()).toContain('${BROWSER_DATA_DIR}/profile:/tmp/chrome-debug:rw');
  expect(compose.services['cdp-forward'].network_mode).toBe('service:chrome');
  expect(compose.services.mcp.depends_on['cdp-forward'].condition).toBe('service_healthy');
});

test('never publishes raw CDP', () => {
  const rendered = JSON.stringify(compose);
  for (const port of ['9222', '9223']) {
    expect(rendered).not.toContain(`:${port}:`);
  }
});
