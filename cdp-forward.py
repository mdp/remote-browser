#!/usr/bin/env python3
"""Forward CDP while rewriting Host for headed Chrome's localhost check."""

import asyncio
import os

LISTEN_PORT = int(os.environ.get("CDP_LISTEN_PORT", "9223"))
TARGET = (
    os.environ.get("CDP_TARGET_HOST", "127.0.0.1"),
    int(os.environ.get("CDP_TARGET_PORT", "9222")),
)


async def pipe(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    try:
        while data := await reader.read(65536):
            writer.write(data)
            await writer.drain()
    except (ConnectionError, asyncio.CancelledError):
        pass
    finally:
        writer.close()


async def handle(client_reader: asyncio.StreamReader,
                 client_writer: asyncio.StreamWriter) -> None:
    upstream_writer = None
    try:
        upstream_reader, upstream_writer = await asyncio.open_connection(*TARGET)
        headers = await client_reader.readuntil(b"\r\n\r\n")
        rewritten = []
        for line in headers.split(b"\r\n"):
            if line.lower().startswith(b"host:"):
                line = b"Host: localhost:9222"
            rewritten.append(line)
        upstream_writer.write(b"\r\n".join(rewritten))
        await upstream_writer.drain()
        await asyncio.gather(
            pipe(client_reader, upstream_writer),
            pipe(upstream_reader, client_writer),
        )
    except (ConnectionError, asyncio.IncompleteReadError, asyncio.LimitOverrunError):
        pass
    finally:
        client_writer.close()
        if upstream_writer is not None:
            upstream_writer.close()


async def main() -> None:
    server = await asyncio.start_server(handle, "0.0.0.0", LISTEN_PORT)
    print(
        f"CDP forwarder: 0.0.0.0:{LISTEN_PORT} -> {TARGET[0]}:{TARGET[1]}",
        flush=True,
    )
    async with server:
        await server.serve_forever()


asyncio.run(main())
