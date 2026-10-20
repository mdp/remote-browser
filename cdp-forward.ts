#!/usr/bin/env bun
// Raw TCP proxy: rewrite Chrome's Host check and preserve WebSocket upgrades.
import { createConnection, createServer, type Socket } from 'node:net';

export function createCdpForwarder(targetHost: string, targetPort: number) {
  return createServer(client => {
    let pending = Buffer.alloc(0);
    let upstream: Socket | undefined;
    const cleanup = () => { client.destroy(); upstream?.destroy(); };
    client.on('error', cleanup);
    client.on('close', () => upstream?.destroy());
    const readHeaders = (chunk: Buffer) => {
      pending = Buffer.concat([pending, chunk]);
      const boundary = pending.indexOf('\r\n\r\n');
      if (boundary < 0) {
        if (pending.length > 65536) cleanup();
        return;
      }
      client.removeListener('data', readHeaders);
      client.pause();
      const header = pending.subarray(0, boundary).toString('latin1')
        .replace(/^host:.*$/gim, `Host: localhost:${targetPort}`);
      const rest = pending.subarray(boundary + 4);
      upstream = createConnection({ host: targetHost, port: targetPort }, () => {
        upstream!.write(Buffer.from(header + '\r\n\r\n', 'latin1'));
        if (rest.length) upstream!.write(rest);
        client.pipe(upstream!).pipe(client);
        client.resume();
      });
      upstream.on('error', cleanup);
      upstream.on('close', () => client.destroy());
    };
    client.on('data', readHeaders);
  });
}

if (import.meta.main) {
  const port = Number(process.env.CDP_LISTEN_PORT || 9223);
  const targetPort = Number(process.env.CDP_TARGET_PORT || 9222);
  createCdpForwarder(process.env.CDP_TARGET_HOST || '127.0.0.1', targetPort)
    .listen(port, '0.0.0.0', () => console.log(`CDP forwarder listening on ${port}`));
}
