import { test, expect } from 'bun:test';
import { createServer, createConnection } from 'node:net';
import { createCdpForwarder } from '../cdp-forward';

test('CDP forwarder rewrites fragmented headers and tunnels upgrade bytes', async () => {
  let received = '';
  const upstream = createServer(socket => {
    let headers = '';
    socket.on('data', chunk => {
      if (headers.includes('\r\n\r\n')) { socket.write(chunk); return; }
      headers += chunk.toString();
      if (headers.includes('\r\n\r\n')) {
        received = headers;
        socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
      }
    });
  });
  await new Promise<void>(r => upstream.listen(0, '127.0.0.1', r));
  const port = (upstream.address() as any).port;
  const proxy = createCdpForwarder('127.0.0.1', port);
  await new Promise<void>(r => proxy.listen(0, '127.0.0.1', r));
  const client = createConnection({ host: '127.0.0.1', port: (proxy.address() as any).port });
  try {
    const result = new Promise<string>((resolve, reject) => {
      let upgraded = false;
      client.on('error', reject);
      client.on('data', chunk => {
        if (!upgraded) { upgraded = true; client.write('test-frame'); }
        else resolve(chunk.toString());
      });
    });
    await new Promise<void>(r => client.once('connect', r));
    client.write('GET /devtools/browser/test HTTP/1.1\r\nHo');
    await Bun.sleep(10);
    client.write('st: docker-host:9223\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
    expect(await result).toBe('test-frame');
    expect(received).toContain(`Host: localhost:${port}`);
    expect(received).not.toContain('docker-host');
    expect(received).toContain('/devtools/browser/test');
  } finally {
    client.destroy();
    proxy.close();
    upstream.close();
  }
}, 5000);
