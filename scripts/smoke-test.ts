#!/usr/bin/env bun
// Read-only automation against an example page in the agent's dedicated tab.
import { resolve } from 'node:path';

const key = process.env.BROWSER_MCP_API_KEY;
if (!key) throw new Error('Set BROWSER_MCP_API_KEY');

const bindIp = process.env.BROWSER_BIND_IP || '127.0.0.1';
const reachableHost = bindIp === '0.0.0.0' || bindIp === '::' ? '127.0.0.1' : bindIp;
const configured = (
  process.env.BROWSER_MCP_URL ||
  `http://${reachableHost}:${process.env.BROWSER_MCP_PORT || '8931'}/mcp`
).replace(/\/+$/, '');
const url = configured.endsWith('/mcp') ? configured : `${configured}/mcp`;
const origin = url.slice(0, -'/mcp'.length);

async function targets(): Promise<any[]> {
  // Maintenance-only inspection inside the CDP container; no host CDP binding.
  const proc = Bun.spawn(['docker', 'compose', '-f', resolve(import.meta.dir, '../compose.yaml'), 'exec', '-T', 'cdp-forward', 'bun', '-e',
    'const r=await fetch("http://127.0.0.1:9223/json/list");if(!r.ok)process.exit(1);console.log(JSON.stringify(await r.json()));'],
    { stdout: 'pipe', stderr: 'pipe' });
  const out = await new Response(proc.stdout).text();
  if (await proc.exited) throw new Error('Unable to inspect targets inside the CDP service');
  return JSON.parse(out);
}

// A container restart can return before the HTTP listener is ready.
const deadline = Date.now() + 15000;
while (true) {
  try {
    const health = await fetch(`${origin}/healthz`, { signal: AbortSignal.timeout(2000) });
    if (health.ok) break;
  } catch {}
  if (Date.now() >= deadline) throw new Error('Browser MCP gateway did not become ready');
  await Bun.sleep(200);
}

const originalTabs = await targets();
let session: string | null = null;
let protocol = '2025-11-25';
let id = 0;
async function rpc(method: string, params?: any, notification = false) {
  const res = await fetch(url, {
    method: 'POST', signal: AbortSignal.timeout(60000),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
      ...(session ? { 'mcp-session-id': session, 'mcp-protocol-version': protocol } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', ...(!notification ? { id: ++id } : {}), method, params }),
  });
  session = res.headers.get('mcp-session-id') || session;
  if (!res.ok) throw new Error(`${method}: HTTP ${res.status}`);
  const text = await res.text();
  if (notification) return;
  const events = text.split('\n').filter(l => l.startsWith('data:')).map(l => JSON.parse(l.slice(5)));
  const data = events.find(e => e.id === id) || (!events.length && JSON.parse(text));
  if (data.error) throw new Error(`${method}: RPC error ${data.error.code}`);
  return data.result;
}
async function call(name: string, args: any = {}) {
  const result = await rpc('tools/call', { name, arguments: args });
  if (result.isError) throw new Error(`${name} returned an error (details omitted to protect browser data)`);
  return result;
}
try {
  for (const [label, headers] of [
    ['missing key', {}], ['wrong key', { Authorization: 'Bearer wrong' }],
    ['session-header bypass', { 'X-Browser-Session': 'anything' }],
  ] as const) {
    const response = await fetch(url, { headers });
    if (response.status !== 401) throw new Error(`${label}: expected 401, got ${response.status}`);
    console.log(`${label}: rejected (401)`);
  }
  const init = await rpc('initialize', { protocolVersion: protocol, capabilities: {}, clientInfo: { name: 'browser-stack-smoke', version: '1' } });
  protocol = init.protocolVersion;
  await rpc('notifications/initialized', {}, true);
  let cursor: string | undefined;
  const tools: any[] = [];
  do {
    const page = await rpc('tools/list', cursor ? { cursor } : {});
    tools.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor);
  if (tools.some(t => t.name === 'agent_browser_close')) throw new Error('Whole-browser close must not be exposed');
  const blocked = await rpc('tools/call', { name: 'agent_browser_close', arguments: {} }).catch(() => 'blocked');
  if (blocked !== 'blocked') throw new Error('Whole-browser close was not blocked');
  console.log(`Discovery: ${tools.length} tools; whole-browser close blocked`);
  // Pin-tab creates/binds the automation tab, without navigating the user's tabs.
  await call('agent_browser_get_url');
  if (process.argv.includes('--exercise')) await call('agent_browser_tab_new', { url: 'https://example.com' });
  const snapshot = await call('agent_browser_snapshot');
  console.log(`Snapshot: ${snapshot.content?.length || 0} content block(s)`);
  const screenshot = await call('agent_browser_screenshot');
  if (!screenshot.content?.some((c: any) => c.type === 'image')) throw new Error('Screenshot did not return native MCP image content');
  console.log('Screenshot: native MCP image returned');
} finally {
  if (session) await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${key}`, 'mcp-session-id': session, 'mcp-protocol-version': protocol }, signal: AbortSignal.timeout(10000) }).catch(() => {});
}
const afterTabs = await targets();
for (const tab of originalTabs) {
  const after = afterTabs.find(t => t.id === tab.id);
  if (!after || after.url !== tab.url) throw new Error('A pre-existing tab changed; inspect VNC before continuing');
}
console.log(`Preserved ${originalTabs.length} pre-existing CDP targets during this test.`);
